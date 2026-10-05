use crate::constants::{
    FLAG_PAUSABLE_MINT, FLAG_PERMANENT_DELEGATE_MINT, FLAG_TRANSFER_FEE_MINT,
};

/// SPL Token-2022 extension type ids come from the extension registry.
/// VERIFY these against the SPL Token-2022 source before mainnet.
pub const EXT_TRANSFER_FEE_CONFIG: u16 = 1;
pub const EXT_DEFAULT_ACCOUNT_STATE: u16 = 6;
pub const EXT_PERMANENT_DELEGATE: u16 = 12;
pub const EXT_TRANSFER_HOOK: u16 = 14;

/// A classic SPL mint is 82 bytes; Token-2022 appends an account type byte and a
/// sequence of `[u16 kind][u16 len][data]` entries.
const BASE_MINT_LEN: usize = 82;
const ACCOUNT_TYPE_LEN: usize = 1;
const TLV_HEADER_LEN: usize = 4;

#[derive(Default, Debug, PartialEq, Eq)]
pub struct MintExtensions {
    pub has_transfer_fee: bool,
    pub default_frozen: bool,
    pub has_permanent_delegate: bool,
    pub has_transfer_hook: bool,
}

impl MintExtensions {
    /// Flags the vault records so the valuation engine can discount the stream.
    pub fn risk_flags(&self) -> u32 {
        let mut flags = 0;
        if self.default_frozen {
            flags |= FLAG_PAUSABLE_MINT;
        }
        if self.has_permanent_delegate {
            flags |= FLAG_PERMANENT_DELEGATE_MINT;
        }
        if self.has_transfer_fee {
            flags |= FLAG_TRANSFER_FEE_MINT;
        }
        flags
    }
}

/// Walks the Token-2022 extension TLV. A mint without a TLV area (classic SPL, or a
/// Token-2022 mint with no extensions) yields the default set.
pub fn parse_mint_extensions(data: &[u8]) -> MintExtensions {
    let mut extensions = MintExtensions::default();
    let mut cursor = BASE_MINT_LEN + ACCOUNT_TYPE_LEN;
    if data.len() <= cursor {
        return extensions;
    }

    while cursor + TLV_HEADER_LEN <= data.len() {
        let kind = u16::from_le_bytes([data[cursor], data[cursor + 1]]);
        let length = u16::from_le_bytes([data[cursor + 2], data[cursor + 3]]) as usize;

        if kind == 0 && length == 0 {
            break;
        }

        // Stop on a truncated entry rather than trusting a partial payload.
        let payload_end = cursor
            .saturating_add(TLV_HEADER_LEN)
            .saturating_add(length);
        if payload_end > data.len() {
            break;
        }

        match kind {
            EXT_TRANSFER_FEE_CONFIG => extensions.has_transfer_fee = true,
            EXT_DEFAULT_ACCOUNT_STATE => extensions.default_frozen = true,
            EXT_PERMANENT_DELEGATE => extensions.has_permanent_delegate = true,
            EXT_TRANSFER_HOOK => extensions.has_transfer_hook = true,
            _ => {}
        }

        cursor = cursor.saturating_add(TLV_HEADER_LEN).saturating_add(length);
    }

    extensions
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tlv(kind: u16, payload: &[u8]) -> Vec<u8> {
        let mut entry = Vec::new();
        entry.extend_from_slice(&kind.to_le_bytes());
        entry.extend_from_slice(&(payload.len() as u16).to_le_bytes());
        entry.extend_from_slice(payload);
        entry
    }

    fn mint_with(entries: &[Vec<u8>]) -> Vec<u8> {
        let mut data = vec![0u8; BASE_MINT_LEN];
        data.push(1); // account type: Mint
        for entry in entries {
            data.extend_from_slice(entry);
        }
        data
    }

    #[test]
    fn classic_mint_has_no_extensions() {
        let data = vec![0u8; BASE_MINT_LEN];
        assert_eq!(parse_mint_extensions(&data), MintExtensions::default());
    }

    #[test]
    fn detects_permanent_delegate_and_transfer_fee() {
        let data = mint_with(&[tlv(EXT_TRANSFER_FEE_CONFIG, &[0u8; 108]), tlv(EXT_PERMANENT_DELEGATE, &[7u8; 32])]);
        let parsed = parse_mint_extensions(&data);
        assert!(parsed.has_transfer_fee);
        assert!(parsed.has_permanent_delegate);
        assert!(!parsed.has_transfer_hook);
        assert_eq!(
            parsed.risk_flags(),
            FLAG_TRANSFER_FEE_MINT | FLAG_PERMANENT_DELEGATE_MINT
        );
    }

    #[test]
    fn detects_transfer_hook() {
        let data = mint_with(&[tlv(EXT_TRANSFER_HOOK, &[9u8; 64])]);
        assert!(parse_mint_extensions(&data).has_transfer_hook);
    }

    #[test]
    fn detects_default_frozen_as_pausable() {
        let data = mint_with(&[tlv(EXT_DEFAULT_ACCOUNT_STATE, &[1])]);
        assert_eq!(parse_mint_extensions(&data).risk_flags(), FLAG_PAUSABLE_MINT);
    }

    #[test]
    fn stops_at_the_uninitialized_marker() {
        let data = mint_with(&[tlv(0, &[]), tlv(EXT_PERMANENT_DELEGATE, &[7u8; 32])]);
        assert!(!parse_mint_extensions(&data).has_permanent_delegate);
    }

    #[test]
    fn survives_a_truncated_entry() {
        let mut data = mint_with(&[tlv(EXT_PERMANENT_DELEGATE, &[7u8; 32])]);
        data.truncate(data.len() - 10);
        let parsed = parse_mint_extensions(&data);
        assert!(!parsed.has_permanent_delegate);
    }
}
