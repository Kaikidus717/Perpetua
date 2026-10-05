use anchor_lang::prelude::*;

#[error_code]
pub enum PerpetuaError {
    #[msg("caller is not authorized")]
    Unauthorized,
    #[msg("position must be fully permanently locked")]
    PositionNotFullyLocked,
    #[msg("position has no permanent-locked liquidity")]
    NoPermanentLock,
    #[msg("share mint authority must be revoked")]
    MintAuthorityNotRevoked,
    #[msg("not enough staked shares")]
    InsufficientShares,
    #[msg("no pending fees to harvest")]
    NothingToHarvest,
    #[msg("share mint does not match the vault")]
    WrongShareMint,
    #[msg("arithmetic overflow")]
    MathOverflow,
    #[msg("pool does not match the vault")]
    InvalidPool,
    #[msg("entry is paused by the admin")]
    EntryPaused,
    #[msg("fee mint carries a TransferHook extension")]
    TransferHookMint,
}
