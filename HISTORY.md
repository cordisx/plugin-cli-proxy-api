# Source history

CLIProxy Providers began as a built-in plugin in `cordisx/cordisx` under
`packages/cli/src/plugins/cli-proxy-api`. This repository starts with a clean
public history so Host-private launcher and provider implementation never enter
the plugin repository.

The product files selected for the renderer migration have the following owner
history in the Host repository, oldest first:

| Commit                                     | Change                                                  |
| ------------------------------------------ | ------------------------------------------------------- |
| `d74c48524b73f47b3cf56de795ca66ed92bbab30` | Add CLIProxy multi-provider sessions (#44)              |
| `bfa5c8ae96fc0c32875a07f443bd85408dd17a47` | Bundle the CLIProxy Providers product README (#48)      |
| `90e1fcc14984e24f64464d9c8777fa364b886787` | Expose the renderer plugin configuration schema (#66)   |
| `c06fa5768da9a3cb4f9d785730d6922c1bcfc06f` | Simplify product UI copy (#94)                          |
| `0e5b10d56c9dd5f27de71595230ab90fdb48e251` | Productize route metadata (#98)                         |
| `c5a6dbecc710f6f9eeeed1cc1bd1797c7200f36c` | Add Manager settings navigation core (#106)             |
| `bf04b2dd406fba6b3f2676f1d29df9da6edd1d48` | Bridge Provider configuration in plugin detail (#117)   |
| `3abcfdeae11149a2c407154eb5275ee9557e7b3d` | Migrate plugin pages to the shared React runtime (#166) |
| `22dc62fa234b033a5fcbcc12d0728f5bcdba1525` | Complete the React Manager experience (#172)            |
| `a56906abc3e0243143832d032e0d29160911e098` | Apply the Host dprint normalization baseline (#293)     |

The extraction baseline is Host commit
`1cbe9d0ff1a803b1486bb2ddcbedc98a187d4f11`. All listed commits were authored
by YiJie. Host-private `service-config.ts`, provider adapters, launcher wiring,
secret handling, and persistence code are intentionally excluded.
