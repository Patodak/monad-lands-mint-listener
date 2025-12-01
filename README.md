# Monad Lands Mint Listener

Service that monitors the Monad Lands NFT contract for mint events and sends notifications to Discord and Twitter.

## Features

- Polls Monad blockchain for Transfer events
- Filters only mint events (from = 0x0)
- Sends Discord notifications via webhook
- Posts to Twitter with rate limiting
- Groups multiple mints for Twitter to avoid spam

## Setup

### Environment Variables

```bash
# Discord
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...

# Twitter (optional)
TWITTER_API_KEY=your_api_key
TWITTER_API_SECRET=your_api_secret
TWITTER_ACCESS_TOKEN=your_access_token
TWITTER_ACCESS_SECRET=your_access_secret

# Monad RPC (optional - has default)
MONAD_RPC_URL=https://monad-mainnet.infura.io/v3/your_key
```

### Deploy to Railway

1. Create new project in Railway
2. Connect this GitHub repo
3. Add environment variables
4. Deploy!

## Contract

- Address: `0xe69A019fbb056f2ED2281105bD2ae0095585a738`
- Chain: Monad Mainnet (ID: 143)

## Links

- Website: https://monadlands.xyz
- Twitter: @AliencitosNFT
- Discord: discord.gg/ZwfZxYPWKU
