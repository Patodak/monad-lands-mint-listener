/**
 * Monad Lands - Mint Listener Service
 *
 * Escucha eventos Transfer del contrato NFT y notifica:
 * - Discord (via webhook)
 * - Twitter (via API)
 *
 * Deploy: Railway (24/7)
 */

const { ethers } = require('ethers');

// ============================================
// CONFIGURACION
// ============================================

const CONFIG = {
  // Contrato NFT
  CONTRACT_ADDRESS: '0xe69A019fbb056f2ED2281105bD2ae0095585a738',

  // RPC Monad (Infura)
  RPC_URL: process.env.MONAD_RPC_URL || 'https://monad-mainnet.infura.io/v3/b2e8404b4e1a4a528312d768f92a7f44',

  // Discord Webhook
  DISCORD_WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL,

  // Twitter API
  TWITTER_API_KEY: process.env.TWITTER_API_KEY,
  TWITTER_API_SECRET: process.env.TWITTER_API_SECRET,
  TWITTER_ACCESS_TOKEN: process.env.TWITTER_ACCESS_TOKEN,
  TWITTER_ACCESS_SECRET: process.env.TWITTER_ACCESS_SECRET,

  // Metadata IPFS
  METADATA_BASE_URL: 'https://4everland.io/ipfs/bafybeidp6pj6v5qioqgr5rnunetwezujp3m7ab35rlcaavfzfpnxsmmk4q',

  // Polling interval (ms) - Monad puede no soportar WebSocket
  POLL_INTERVAL: 10000, // 10 segundos

  // Rate limiting para Twitter
  TWEET_COOLDOWN: 60000, // 1 minuto entre tweets
};

// ABI minimo para eventos Transfer
const CONTRACT_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'
];

// ============================================
// ESTADO
// ============================================

let lastProcessedBlock = 0;
let lastTweetTime = 0;
let pendingMints = []; // Cola para agrupar mints

// ============================================
// FUNCIONES AUXILIARES
// ============================================

function shortenAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

async function fetchMetadata(tokenId) {
  try {
    const response = await fetch(`${CONFIG.METADATA_BASE_URL}/${tokenId}`);
    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.error(`Error fetching metadata for token ${tokenId}:`, error.message);
  }
  return null;
}

function getBiomeEmoji(biome) {
  const emojis = {
    'Pradera': '🌿',
    'Desierto': '🏜️',
    'Volcanico': '🌋',
    'Cyber-Monad': '🤖',
    'Eldorado': '👑'
  };
  return emojis[biome] || '🏝️';
}

// ============================================
// DISCORD WEBHOOK
// ============================================

async function sendDiscordNotification(mint) {
  if (!CONFIG.DISCORD_WEBHOOK_URL) {
    console.log('Discord webhook not configured, skipping...');
    return;
  }

  const { tokenId, minter, biome, txHash } = mint;
  const biomeEmoji = getBiomeEmoji(biome);

  const embed = {
    title: `${biomeEmoji} Nueva Land Minteada!`,
    color: 0xFFD93D, // Amarillo dorado
    fields: [
      {
        name: '🏝️ Land',
        value: `#${tokenId}`,
        inline: true
      },
      {
        name: '👤 Minter',
        value: `\`${shortenAddress(minter)}\``,
        inline: true
      },
      {
        name: '🌍 Bioma',
        value: biome || 'Cargando...',
        inline: true
      }
    ],
    footer: {
      text: 'Monad Lands | monadlands.xyz'
    },
    timestamp: new Date().toISOString()
  };

  // Agregar link a MonadScan si tenemos txHash
  if (txHash) {
    embed.fields.push({
      name: '🔗 Transaccion',
      value: `[Ver en MonadScan](https://monadscan.com/tx/${txHash})`,
      inline: false
    });
  }

  try {
    const response = await fetch(CONFIG.DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Monad Lands Bot',
        avatar_url: 'https://monadlands.xyz/logo.png',
        embeds: [embed]
      })
    });

    if (response.ok) {
      console.log(`✅ Discord notification sent for Land #${tokenId}`);
    } else {
      console.error('Discord webhook error:', response.status);
    }
  } catch (error) {
    console.error('Discord notification error:', error.message);
  }
}

// ============================================
// TWITTER API
// ============================================

async function postTweet(text) {
  if (!CONFIG.TWITTER_API_KEY || !CONFIG.TWITTER_ACCESS_TOKEN) {
    console.log('Twitter not configured, skipping...');
    return;
  }

  // Rate limiting
  const now = Date.now();
  if (now - lastTweetTime < CONFIG.TWEET_COOLDOWN) {
    console.log('Tweet cooldown active, queuing...');
    return false;
  }

  try {
    // Usar OAuth 1.0a para Twitter API v2
    const { TwitterApi } = require('twitter-api-v2');

    const client = new TwitterApi({
      appKey: CONFIG.TWITTER_API_KEY,
      appSecret: CONFIG.TWITTER_API_SECRET,
      accessToken: CONFIG.TWITTER_ACCESS_TOKEN,
      accessSecret: CONFIG.TWITTER_ACCESS_SECRET,
    });

    const response = await client.v2.tweet(text);
    lastTweetTime = now;
    console.log(`✅ Tweet posted: ${response.data.id}`);
    return true;
  } catch (error) {
    console.error('Twitter error:', error.message);
    return false;
  }
}

async function sendTwitterNotification(mints) {
  // Si hay muchos mints, agruparlos
  if (mints.length === 1) {
    const mint = mints[0];
    const emoji = getBiomeEmoji(mint.biome);
    const tweet = `${emoji} Land #${mint.tokenId} just minted!

Biome: ${mint.biome || 'Unknown'}

Monad Lands: 6,000 unique lands on @moaboratory
Mint yours: monadlands.xyz

#Monad #NFT #MonadLands`;

    await postTweet(tweet);
  } else if (mints.length > 1) {
    // Agrupar multiples mints
    const count = mints.length;
    const tokenIds = mints.slice(0, 3).map(m => `#${m.tokenId}`).join(', ');
    const more = count > 3 ? ` and ${count - 3} more!` : '!';

    const tweet = `🔥 ${count} Lands just minted!

${tokenIds}${more}

The land rush is ON!
Mint yours: monadlands.xyz

#Monad #NFT #MonadLands`;

    await postTweet(tweet);
  }
}

// ============================================
// EVENT LISTENER
// ============================================

async function processTransferEvent(event, provider) {
  const { from, to, tokenId } = event.args;
  const txHash = event.transactionHash;

  // Solo procesar mints (from = address(0))
  if (from !== ethers.ZeroAddress) {
    return null;
  }

  console.log(`🆕 Mint detected: Land #${tokenId.toString()} -> ${shortenAddress(to)}`);

  // Obtener metadata
  const metadata = await fetchMetadata(tokenId.toString());
  const biome = metadata?.attributes?.find(a => a.trait_type === 'Biome')?.value;

  return {
    tokenId: tokenId.toString(),
    minter: to,
    biome: biome || 'Unknown',
    txHash: txHash,
    timestamp: Date.now()
  };
}

async function pollForMints(provider, contract) {
  try {
    const currentBlock = await provider.getBlockNumber();

    if (lastProcessedBlock === 0) {
      // Primera ejecucion - empezar desde bloque actual
      lastProcessedBlock = currentBlock - 1;
      console.log(`📍 Starting from block ${lastProcessedBlock}`);
    }

    if (currentBlock <= lastProcessedBlock) {
      return;
    }

    console.log(`🔍 Scanning blocks ${lastProcessedBlock + 1} to ${currentBlock}...`);

    // Obtener eventos Transfer
    const filter = contract.filters.Transfer(ethers.ZeroAddress); // Solo mints
    const events = await contract.queryFilter(filter, lastProcessedBlock + 1, currentBlock);

    const newMints = [];
    for (const event of events) {
      const mint = await processTransferEvent(event, provider);
      if (mint) {
        newMints.push(mint);

        // Enviar a Discord inmediatamente
        await sendDiscordNotification(mint);
      }
    }

    // Enviar a Twitter (agrupado)
    if (newMints.length > 0) {
      pendingMints.push(...newMints);

      // Procesar cola de Twitter
      if (Date.now() - lastTweetTime >= CONFIG.TWEET_COOLDOWN) {
        await sendTwitterNotification(pendingMints);
        pendingMints = [];
      }
    }

    lastProcessedBlock = currentBlock;
  } catch (error) {
    console.error('Polling error:', error.message);
  }
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('🚀 Monad Lands Mint Listener Starting...');
  console.log(`📍 Contract: ${CONFIG.CONTRACT_ADDRESS}`);
  console.log(`🌐 RPC: ${CONFIG.RPC_URL}`);
  console.log(`📢 Discord: ${CONFIG.DISCORD_WEBHOOK_URL ? 'Configured' : 'Not configured'}`);
  console.log(`🐦 Twitter: ${CONFIG.TWITTER_API_KEY ? 'Configured' : 'Not configured'}`);
  console.log('');

  // Conectar a Monad
  const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
  const contract = new ethers.Contract(CONFIG.CONTRACT_ADDRESS, CONTRACT_ABI, provider);

  // Verificar conexion
  try {
    const network = await provider.getNetwork();
    console.log(`✅ Connected to network: ${network.name} (chainId: ${network.chainId})`);
  } catch (error) {
    console.error('❌ Failed to connect:', error.message);
    process.exit(1);
  }

  console.log(`\n🔄 Polling every ${CONFIG.POLL_INTERVAL / 1000} seconds...\n`);

  // Iniciar polling
  setInterval(() => pollForMints(provider, contract), CONFIG.POLL_INTERVAL);

  // Primera ejecucion inmediata
  await pollForMints(provider, contract);
}

// Manejar errores no capturados
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
});

// Iniciar
main().catch(console.error);
