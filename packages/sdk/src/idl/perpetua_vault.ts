export const PERPETUA_VAULT_IDL = {
  "address": "G7ixan3xxy2SRR84Qnv7pUAh1wSinYdhzKwJyhFfqWH2",
  "metadata": {
    "name": "perpetua_vault",
    "version": "0.1.0",
    "spec": "0.1.0"
  },
  "instructions": [
    {
      "name": "initConfig",
      "discriminator": [
        23,
        235,
        115,
        232,
        168,
        96,
        1,
        231
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true
        },
        {
          "name": "systemProgram"
        }
      ],
      "args": [
        {
          "name": "protocolFeeBps",
          "type": "u16"
        }
      ]
    },
    {
      "name": "createVault",
      "discriminator": [
        29,
        237,
        247,
        208,
        193,
        82,
        54,
        135
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "config"
        },
        {
          "name": "pool"
        },
        {
          "name": "position",
          "writable": true
        },
        {
          "name": "positionNftMint"
        },
        {
          "name": "positionNftAccount",
          "writable": true
        },
        {
          "name": "positionNftProgram"
        },
        {
          "name": "tokenAMint"
        },
        {
          "name": "tokenBMint"
        },
        {
          "name": "tokenAProgram"
        },
        {
          "name": "tokenBProgram"
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "shareMint",
          "writable": true,
          "signer": true
        },
        {
          "name": "creatorShareAccount",
          "writable": true
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram"
        },
        {
          "name": "systemProgram"
        },
        {
          "name": "cpAmmProgram"
        }
      ],
      "args": []
    },
    {
      "name": "crankClaim",
      "discriminator": [
        193,
        62,
        163,
        14,
        168,
        236,
        179,
        103
      ],
      "accounts": [
        {
          "name": "caller",
          "signer": true
        },
        {
          "name": "config"
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "poolAuthority"
        },
        {
          "name": "pool"
        },
        {
          "name": "position",
          "writable": true
        },
        {
          "name": "positionNftAccount"
        },
        {
          "name": "tokenAMint"
        },
        {
          "name": "tokenBMint"
        },
        {
          "name": "tokenAVault",
          "writable": true
        },
        {
          "name": "tokenBVault",
          "writable": true
        },
        {
          "name": "eventAuthority"
        },
        {
          "name": "vaultAAccount",
          "writable": true
        },
        {
          "name": "vaultBAccount",
          "writable": true
        },
        {
          "name": "treasury"
        },
        {
          "name": "treasuryAAccount",
          "writable": true
        },
        {
          "name": "treasuryBAccount",
          "writable": true
        },
        {
          "name": "tokenAProgram"
        },
        {
          "name": "tokenBProgram"
        },
        {
          "name": "cpAmmProgram"
        }
      ],
      "args": []
    },
    {
      "name": "stake",
      "discriminator": [
        206,
        176,
        202,
        18,
        200,
        209,
        179,
        108
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "config"
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "poolAuthority"
        },
        {
          "name": "pool"
        },
        {
          "name": "position",
          "writable": true
        },
        {
          "name": "positionNftAccount"
        },
        {
          "name": "tokenAMint"
        },
        {
          "name": "tokenBMint"
        },
        {
          "name": "tokenAVault",
          "writable": true
        },
        {
          "name": "tokenBVault",
          "writable": true
        },
        {
          "name": "eventAuthority"
        },
        {
          "name": "vaultAAccount",
          "writable": true
        },
        {
          "name": "vaultBAccount",
          "writable": true
        },
        {
          "name": "treasury"
        },
        {
          "name": "treasuryAAccount",
          "writable": true
        },
        {
          "name": "treasuryBAccount",
          "writable": true
        },
        {
          "name": "tokenAProgram"
        },
        {
          "name": "tokenBProgram"
        },
        {
          "name": "cpAmmProgram"
        },
        {
          "name": "stake",
          "writable": true
        },
        {
          "name": "shareMint"
        },
        {
          "name": "ownerShareAccount",
          "writable": true
        },
        {
          "name": "vaultShareAccount",
          "writable": true
        },
        {
          "name": "shareTokenProgram"
        },
        {
          "name": "systemProgram"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "unstake",
      "discriminator": [
        90,
        95,
        107,
        42,
        205,
        124,
        50,
        225
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "config"
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "poolAuthority"
        },
        {
          "name": "pool"
        },
        {
          "name": "position",
          "writable": true
        },
        {
          "name": "positionNftAccount"
        },
        {
          "name": "tokenAMint"
        },
        {
          "name": "tokenBMint"
        },
        {
          "name": "tokenAVault",
          "writable": true
        },
        {
          "name": "tokenBVault",
          "writable": true
        },
        {
          "name": "eventAuthority"
        },
        {
          "name": "vaultAAccount",
          "writable": true
        },
        {
          "name": "vaultBAccount",
          "writable": true
        },
        {
          "name": "treasury"
        },
        {
          "name": "treasuryAAccount",
          "writable": true
        },
        {
          "name": "treasuryBAccount",
          "writable": true
        },
        {
          "name": "tokenAProgram"
        },
        {
          "name": "tokenBProgram"
        },
        {
          "name": "cpAmmProgram"
        },
        {
          "name": "stake",
          "writable": true
        },
        {
          "name": "shareMint"
        },
        {
          "name": "ownerShareAccount",
          "writable": true
        },
        {
          "name": "vaultShareAccount",
          "writable": true
        },
        {
          "name": "shareTokenProgram"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "unstakeNoClaim",
      "discriminator": [
        55,
        185,
        253,
        58,
        101,
        72,
        203,
        83
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "stake",
          "writable": true
        },
        {
          "name": "shareMint"
        },
        {
          "name": "ownerShareAccount",
          "writable": true
        },
        {
          "name": "vaultShareAccount",
          "writable": true
        },
        {
          "name": "shareTokenProgram"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "setPaused",
      "discriminator": [
        91,
        60,
        125,
        192,
        176,
        225,
        166,
        218
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true
        },
        {
          "name": "config",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "paused",
          "type": "bool"
        }
      ]
    },
    {
      "name": "setRiskFlags",
      "discriminator": [
        139,
        4,
        8,
        39,
        214,
        108,
        62,
        20
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true
        },
        {
          "name": "config"
        },
        {
          "name": "vault",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "flags",
          "type": "u32"
        }
      ]
    },
    {
      "name": "harvest",
      "discriminator": [
        228,
        241,
        31,
        182,
        53,
        169,
        59,
        199
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "stake",
          "writable": true
        },
        {
          "name": "tokenAMint"
        },
        {
          "name": "tokenBMint"
        },
        {
          "name": "vaultAAccount",
          "writable": true
        },
        {
          "name": "vaultBAccount",
          "writable": true
        },
        {
          "name": "ownerAAccount",
          "writable": true
        },
        {
          "name": "ownerBAccount",
          "writable": true
        },
        {
          "name": "tokenAProgram"
        },
        {
          "name": "tokenBProgram"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "Config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    },
    {
      "name": "Vault",
      "discriminator": [
        211,
        8,
        232,
        43,
        2,
        152,
        117,
        119
      ]
    },
    {
      "name": "Stake",
      "discriminator": [
        150,
        197,
        176,
        29,
        55,
        132,
        112,
        149
      ]
    }
  ],
  "events": [
    {
      "name": "ConfigInitialized",
      "discriminator": [
        181,
        49,
        200,
        156,
        19,
        167,
        178,
        91
      ]
    },
    {
      "name": "VaultCreated",
      "discriminator": [
        117,
        25,
        120,
        254,
        75,
        236,
        78,
        115
      ]
    },
    {
      "name": "FeesClaimed",
      "discriminator": [
        22,
        104,
        110,
        222,
        38,
        157,
        14,
        62
      ]
    },
    {
      "name": "Staked",
      "discriminator": [
        11,
        146,
        45,
        205,
        230,
        58,
        213,
        240
      ]
    },
    {
      "name": "Unstaked",
      "discriminator": [
        27,
        179,
        156,
        215,
        47,
        71,
        195,
        7
      ]
    },
    {
      "name": "Harvested",
      "discriminator": [
        249,
        229,
        78,
        151,
        106,
        185,
        149,
        11
      ]
    },
    {
      "name": "RiskFlagsSet",
      "discriminator": [
        235,
        160,
        190,
        118,
        180,
        63,
        115,
        46
      ]
    },
    {
      "name": "EntryPaused",
      "discriminator": [
        61,
        206,
        60,
        65,
        28,
        16,
        12,
        20
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "Unauthorized",
      "msg": "caller is not authorized"
    },
    {
      "code": 6001,
      "name": "PositionNotFullyLocked",
      "msg": "position must be fully permanently locked"
    },
    {
      "code": 6002,
      "name": "NoPermanentLock",
      "msg": "position has no permanent-locked liquidity"
    },
    {
      "code": 6003,
      "name": "MintAuthorityNotRevoked",
      "msg": "share mint authority must be revoked"
    },
    {
      "code": 6004,
      "name": "InsufficientShares",
      "msg": "not enough staked shares"
    },
    {
      "code": 6005,
      "name": "NothingToHarvest",
      "msg": "no pending fees to harvest"
    },
    {
      "code": 6006,
      "name": "WrongShareMint",
      "msg": "share mint does not match the vault"
    },
    {
      "code": 6007,
      "name": "MathOverflow",
      "msg": "arithmetic overflow"
    },
    {
      "code": 6008,
      "name": "InvalidPool",
      "msg": "pool does not match the vault"
    },
    {
      "code": 6009,
      "name": "EntryPaused",
      "msg": "entry is paused by the admin"
    },
    {
      "code": 6010,
      "name": "TransferHookMint",
      "msg": "fee mint carries a TransferHook extension"
    }
  ],
  "types": [
    {
      "name": "Config",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "protocolFeeBps",
            "type": "u16"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "pausedEntry",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "Vault",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "position",
            "type": "pubkey"
          },
          {
            "name": "positionNftMint",
            "type": "pubkey"
          },
          {
            "name": "positionNftAccount",
            "type": "pubkey"
          },
          {
            "name": "tokenAMint",
            "type": "pubkey"
          },
          {
            "name": "tokenBMint",
            "type": "pubkey"
          },
          {
            "name": "tokenAProgram",
            "type": "pubkey"
          },
          {
            "name": "tokenBProgram",
            "type": "pubkey"
          },
          {
            "name": "shareMint",
            "type": "pubkey"
          },
          {
            "name": "totalStaked",
            "type": "u64"
          },
          {
            "name": "accFeePerShareA",
            "type": "u128"
          },
          {
            "name": "accFeePerShareB",
            "type": "u128"
          },
          {
            "name": "carryA",
            "type": "u64"
          },
          {
            "name": "carryB",
            "type": "u64"
          },
          {
            "name": "totalClaimedA",
            "type": "u64"
          },
          {
            "name": "totalClaimedB",
            "type": "u64"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "riskFlags",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "Stake",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "debtA",
            "type": "u128"
          },
          {
            "name": "debtB",
            "type": "u128"
          },
          {
            "name": "pendingA",
            "type": "u64"
          },
          {
            "name": "pendingB",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "ConfigInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "protocolFeeBps",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "VaultCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "position",
            "type": "pubkey"
          },
          {
            "name": "shareMint",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "FeesClaimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "deltaA",
            "type": "u64"
          },
          {
            "name": "deltaB",
            "type": "u64"
          },
          {
            "name": "totalStaked",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "Staked",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "Unstaked",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "Harvested",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "amountA",
            "type": "u64"
          },
          {
            "name": "amountB",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "RiskFlagsSet",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "flags",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "EntryPaused",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "paused",
            "type": "bool"
          }
        ]
      }
    }
  ]
} as const;
