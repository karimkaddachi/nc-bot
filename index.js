const { Client, GatewayIntentBits , Collection, ActivityType,TextInputStyle ,TextInputBuilder,EmbedBuilder,Partials,ModalBuilder, ActionRowBuilder,PermissionsBitField, Events,ButtonBuilder, ButtonStyle} = require('discord.js');
const { joinVoiceChannel} = require('@discordjs/voice');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
dotenv.config();
const { QuickDB } = require('quick.db');
const db = new QuickDB();



const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildInvites,
      GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [Partials.Channel, Partials.GuildMember],
  });


//system verify ----------------------------------------------------------------------------------------------------------------------------------------------------


// Configuration constants
const VC_WAITING_ID = '1366465330079203420';  // Voice channel ID for verification waiting
const TEXT_CHANNEL_ID = '1366363278355468288';  // Text channel for verification requests
const VERIFIER_ROLE_ID = '1366362977871335474';  // Role ID for verifiers
const VC_OPTIONS = [
  { id: '1366363279298920469', label: 'Verify 1' },
  { id: '1366363281152806962', label: 'Verify 2' },
  { id: '1366363282453037107', label: 'Verify 3' }
];

// Voice State Update event
client.on('voiceStateUpdate', async (oldState, newState) => {
  try {
    if (!oldState.channelId && newState.channelId === VC_WAITING_ID) {
      const member = newState.member;
      const channel = await client.channels.fetch(TEXT_CHANNEL_ID);

      if (!channel || !member) return;

// Replace with the channel ID
const channelID = '1366465330079203420';
const channels = await client.channels.fetch(channelID);

const embed = new EmbedBuilder()
    .setTitle('🔔 New Verification Request')
    .setDescription(`🧑 ${member} joined the ${channels.name}.\n👮 <@&${VERIFIER_ROLE_ID}>, please take a look!`)
    .setColor(0x00AEFF)
    .setTimestamp();



 
      const buttons = new ActionRowBuilder().addComponents(
        VC_OPTIONS.map(vc =>
          new ButtonBuilder()
            .setCustomId(`verify_${vc.id}_${member.id}`)
            .setLabel(vc.label)
            .setStyle(ButtonStyle.Success)
        )
      );

      await channel.send({content: `<@&${VERIFIER_ROLE_ID}>`, embeds: [embed], components: [buttons], });
    }
  } catch (err) {
    console.error('Error in voiceStateUpdate:', err);
  }
});

// InteractionCreate event
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;

  const [action, targetVCId, memberId] = interaction.customId.split('_');
  if (action !== 'verify') return;

  try {
    const memberWhoClicked = interaction.member;
    const guild = interaction.guild;
    const targetMember = await guild.members.fetch(memberId);

    if (!memberWhoClicked || !guild || !targetMember) {
      if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true });
      return await interaction.editReply({ content: '⚠️ Error: Missing data.' });
    }

    const isVerifier = memberWhoClicked.roles.cache.has(VERIFIER_ROLE_ID);
    const isAdmin = memberWhoClicked.permissions.has(PermissionsBitField.Flags.Administrator);

    if (!isVerifier && !isAdmin) {
      if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true });
      return await interaction.editReply({ content: '🚫 You do not have permission to use this button.' });
    }

    if (!targetMember.voice.channelId) {
      if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true });
      return await interaction.editReply({ content: '❌ The user is no longer in a voice channel.' });
    }

    if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true });

    await targetMember.voice.setChannel(targetVCId);

    await interaction.editReply({ content: `✅ ${targetMember} has been moved to <#${targetVCId}>.` });

  } catch (err) {
    console.error('Error while moving the member:', err);
    try {
      if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true });
      await interaction.editReply({ content: '⚠️ An error occurred while moving the member.' });
    } catch (replyError) {
      console.error('Failed to reply to the interaction:', replyError);
    }
  }
});


//activity -------------------------------------------------------------------------------------------------------------------------------


const activities = ["⚡  Night Chill Community  ⚡ "];
let index = 0;

client.once('ready', async () => {

    // Status update
    setInterval(() => {
        client.user.setActivity(activities[index], {
            type: ActivityType.Streaming,
            url: "https://www.twitch.tv/NC Community"
        });

        index = (index + 1) % activities.length;
    }, 3000); // Kol 3 secondes



//regiser commands -------------------------------------------------------------------------------------------------------------------------------


    // Charger les commandes depuis le dossier "commands"
    client.commands = new Collection();
    const commandsPath = path.join(__dirname, 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    if (commandFiles.length === 0) {
        console.error('Aucune commande trouvée dans le dossier "commands"!');
        return;
    }

    for (const file of commandFiles) {
        const command = require(path.join(commandsPath, file));
        if (command.data && command.data.name) {
            client.commands.set(command.data.name, command);
        } else {
            console.error(`La commande dans le fichier ${file} n'a pas de propriété "name" !`);
        }
    }

    // Enregistrer les commandes
    const commands = client.commands.map(cmd => cmd.data.toJSON());
    await client.application.commands.set(commands);
    console.log('✅ Commands registered!');
});

// Gérer les commandes slash
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) {
        console.error(`Commande non trouvée : ${interaction.commandName}`);
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: '❌ Error executing command!', ephemeral: true });
        
    }
});



//welcome --------------------------------------------------------------------------------------------------------------------------------------



const configPath = './server-welcome.json';
const invitesCache = new Map(); // Caching invites per guild

// Charger la config
function loadConfig() {
    if (!fs.existsSync(configPath)) {
        fs.writeFileSync(configPath, JSON.stringify({}, null, 2));
    }
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

// Charger les invites quand le bot est prêt
client.on('ready', async () => {
    console.log(`✅ Connecté en tant que ${client.user.tag}`);
    for (const [guildId, guild] of client.guilds.cache) {
        const invites = await guild.invites.fetch().catch(() => null);
        if (invites) {
            invitesCache.set(guild.id, new Map(invites.map(inv => [inv.code, inv.uses])));
        }
    }
});

// Quand un membre rejoint
client.on('guildMemberAdd', async member => {
    const config = loadConfig();
    const serverConfig = config[member.guild.id];
    if (!serverConfig || !serverConfig.welcomeChannel) return;

    const channel = member.guild.channels.cache.get(serverConfig.welcomeChannel);
    if (!channel) return;

    const newInvites = await member.guild.invites.fetch().catch(() => null);
    const cachedInvites = invitesCache.get(member.guild.id);

    let usedInvite = null;
    if (newInvites && cachedInvites) {
        usedInvite = newInvites.find(inv => (cachedInvites.get(inv.code) || 0) < inv.uses);
    }

    // Update the cache
    invitesCache.set(member.guild.id, new Map(newInvites.map(inv => [inv.code, inv.uses])));

    const inviter = usedInvite?.inviter || null;
    const inviteCode = usedInvite?.code || 'Unknown';

    const embed = new EmbedBuilder()
        .setColor('Random')
        .setTitle('🎉 Welcome!')
        .setDescription(`Welcome ${member.user.toString()} To **${member.guild.name}**`)
        .addFields(
            { name: 'Username', value: `${member.user.username}`, inline: true },
            { name: 'Invite By', value: inviter ? `<@${inviter.id}>` : 'Unknown', inline: true },
            { name: 'Invite Used', value: `||${inviteCode}||`, inline: true },
            { name: "You're Member", value: `${member.guild.memberCount}`, inline: true }
        )
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setTimestamp()
        .setImage("https://cdn.discordapp.com/attachments/1336751735200419925/1346861571451650098/standard.gif")
        .setFooter({ text: "シNC → BOT !", iconURL: member.guild.iconURL() });

    channel.send({ content: `${member.user.toString()}`, embeds: [embed] });
});

//auto role ------------------------------------------------------------------------------------------------------------------------------------


const ROLE_ID = '1366363025774215240';
client.on('guildMemberAdd', async (member) => {
    try {
        const role = member.guild.roles.cache.get(ROLE_ID);
        if (role) {
            await member.roles.add(role);
            console.log(`Role ${role.name} added to ${member.user.tag}`);
        } else {
            console.log("Role not found.");
        }
    } catch (error) {
        console.error("Error adding role:", error);
    }
});


//bot voice -----------------------------------------------------------------------------------------------------------


const GUILD_ID = '1036884096749674496';
const VC_ID = '1366363210810134550';

client.once('ready', async () => {
    console.log(`🤖 Logged in as ${client.user.tag}`);

    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        const channel = guild.channels.cache.get(VC_ID);

        if (channel && channel.isVoiceBased()) {
            joinVoiceChannel({
                channelId: VC_ID,
                guildId: GUILD_ID,
                adapterCreator: guild.voiceAdapterCreator
            });

            console.log(`✅ Joined VC: ${channel.name}`);
        } else {
            console.log('❌ VC not found or not a voice channel!');
        }
    } catch (error) {
        console.error('❌ Error joining VC:', error);
    }
});

//game counting ----------------------------------------------------------------------------------------------------------


const CHANNEL_ID = "1366363339466346568";
const COUNT_FILE = "./count.json";

function loadCurrentNumber() {
  if (fs.existsSync(COUNT_FILE)) {
    const data = fs.readFileSync(COUNT_FILE);
    try {
      const json = JSON.parse(data);
      return json.currentNumber || 1;
    } catch (e) {
      console.error("❌ Failed to parse count.json:", e);
      return 1;
    }
  } else {
    return 1;
  }
}

function saveCurrentNumber(number) {
  fs.writeFileSync(COUNT_FILE, JSON.stringify({ currentNumber: number }, null, 2));
}

let currentNumber = loadCurrentNumber(); // Load from file

client.on("ready", () => {
  console.log(`✅ Bot ready as ${client.user.tag}`);
  console.log(`➡️ Resuming from number: ${currentNumber}`);
});

client.on("messageCreate", async (message) => {
  if (message.channel.id !== CHANNEL_ID || message.author.bot) return;

  const content = message.content.trim();

  if (!/^\d+$/.test(content)) {
    await message.delete();
    return;
  }

  const userNumber = parseInt(content);

  if (userNumber === currentNumber) {
    await message.delete();

    const embed = new EmbedBuilder()
      .setTitle("✅ Counting")
      .setDescription(`**${message.author} wrote the number: ${userNumber}**`)
      .setColor("Green");

    await message.channel.send({ embeds: [embed] });

    currentNumber++; // Advance to next number
    saveCurrentNumber(currentNumber); // Save to file
  } else {
    await message.delete();

    const embed = new EmbedBuilder()
      .setTitle("❌ Wrong")
      .setDescription(`**${message.author}, your number is wrong! You are not number ${currentNumber}**`)
      .setColor("Red");

    message.channel.send({ embeds: [embed] }).then(sentMessage => {
      setTimeout(() => {
        sentMessage.delete().catch(err => console.error("Error deleting message:", err));
      }, 5000);
    });
  }
});

//boost---------------------------------------------------------------------------------------------------


const BOOST_ROLE_ID = "1366745515907092500"; // عوض ID_ROLE_HOUNI ب ID متاع الRole
const BOOST_CHANNEL_ID = "1366363264094699561"; // عوض ID_CHANNEL_HOUNI ب ID متاع Channel boosts

client.on("guildMemberUpdate", async (oldMember, newMember) => {
    const hasBoosted = newMember.premiumSince !== null;
    const hadBoosted = oldMember.premiumSince !== null;
    const role = newMember.guild.roles.cache.get(BOOST_ROLE_ID);
  
    if (hasBoosted && !hadBoosted) {
      // عطاه Boost - نزيده Role و نبعتلو رسالة
      await newMember.roles.add(role);
  
      const embed = new EmbedBuilder()
        .setTitle("Server Boosts")
        .setDescription(`Thank you ${newMember} ❤️ for boosting the server!`)
        .setImage("https://media.discordapp.net/attachments/1338168939728994325/1338591476095123456/standard.gif?ex=67aba3f5&is=67aa5275&hm=6ec9ee15085d221146735fdbc47bbf7b27cc1b432a93192ce2314396a75e4198&=&width=850&height=300") // ضع هنا رابط صورة تناسب التصميم
        .setColor("#ff3d3d")
        .setFooter({ text: "ArenaBot  !", iconURL: member.guild.iconURL() });
  
      const channel = newMember.guild.channels.cache.get(BOOST_CHANNEL_ID);
      if (channel) channel.send({ embeds: [embed] });
  
    } else if (!hasBoosted && hadBoosted) {
      // وقف ال Boost - نحيلو Role
      await newMember.roles.remove(role);
    }
  });

  
//nickname-------------------------------------------------------------------------------------------------------



client.on('messageCreate', async (message) => {
  if (message.content === '!nickname') {
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Nickname Setup')
      .setDescription('Click the button below to change your nickname ✏️')
      .setThumbnail(message.guild.iconURL())
      .setImage(message.guild.bannerURL({ size: 1024 }))
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('rename')
        .setLabel('Rename')
        .setStyle(ButtonStyle.Primary)
    );

    await message.channel.send({ embeds: [embed], components: [row] });
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton() && interaction.customId === 'rename') {
    // Show Modal
    const modal = new ModalBuilder()
      .setCustomId('nicknameModal')
      .setTitle('Change Your Nickname');

    const nicknameInput = new TextInputBuilder()
      .setCustomId('nicknameInput')
      .setLabel("Enter your new nickname")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g. !NC M4hdi')
      .setRequired(true);

    const actionRow = new ActionRowBuilder().addComponents(nicknameInput);
    modal.addComponents(actionRow);

    await interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && interaction.customId === 'nicknameModal') {
    const newNickname = interaction.fields.getTextInputValue('nicknameInput');
    const oldNickname = interaction.member.nickname || interaction.user.username; // fallback if no nickname

    try {
      await interaction.member.setNickname(newNickname);
      await interaction.reply({ content: `✅ Your nickname has been changed to: **${newNickname}**`, ephemeral: true });

      // Logs
      const logChannel = await client.channels.fetch('1366363486128701542');
      const logEmbed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('📛 Nickname Changed')
        .addFields(
          { name: '👤 User', value: `<@${interaction.user.id}>`, inline: false },
          { name: '📌 Old Nickname', value: oldNickname, inline: true },
          { name: '✏️ New Nickname', value: newNickname, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: `User ID: ${interaction.user.id}` });

      if (logChannel && logChannel.isTextBased()) {
        await logChannel.send({ embeds: [logEmbed] });
      }
    } catch (err) {
      await interaction.reply({ content: `❌ I couldn't change your nickname. Check my permissions.`, ephemeral: true });
    }
  }
});

//selfies -----------------------------------------------------------------------------------------------------------


const channelsToWatch = ['1366363308889866253', '1366363310521581638', '1366363311733608489', '1366363313717514320', '1366363317270216715', '1366363319748919356', '1366363327328157757', '1366363328926187530', '1366363330910093394'];

// Initialize messageStats Map
const messageStats = new Map();

client.on('messageCreate', async (message) => {
  if (message.author.bot || !channelsToWatch.includes(message.channel.id)) return;
  if (!message.attachments.size) return;

  const image = message.attachments.first().url;

  // Create embed with the image
  const embed = new EmbedBuilder()
    .setColor(0x2f3136)
    .setTitle('📸 New Post!')
    .setImage(image) // Set image to embed
    .setDescription(`\n**📊 Reactions:**\n👍 0%   ❤️ 0%   😂 0%\n**💬 Comments:** 0`) // Put percentages in description after image
    .setFooter({ text: 'Lbot Reaction System' });

  // Send the embed with the buttons (react buttons)
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('like').setLabel('👍 Like').setStyle(1),
    new ButtonBuilder().setCustomId('love').setLabel('❤️ Love').setStyle(4),
    new ButtonBuilder().setCustomId('haha').setLabel('😂 Haha').setStyle(2),
    new ButtonBuilder().setCustomId('comment').setLabel('💬 Comment').setStyle(3)
  );

  const sent = await message.channel.send({ embeds: [embed], components: [buttons] });

  // Create stats object to track reactions
  const stats = {
    message: sent,
    likes: 0,
    loves: 0,
    hahas: 0,
    comments: 0,
    thread: null, // To store the thread if needed for comments
  };

  // Store the stats in the messageStats Map
  messageStats.set(sent.id, stats);

  // Wait for 3 seconds, then delete the original message (image)
  setTimeout(async () => {
    await message.delete();
  }, 3000);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const stats = messageStats.get(interaction.message.id);
  if (!stats) return;

  switch (interaction.customId) {
    case 'like':
      stats.likes++;
      break;
    case 'love':
      stats.loves++;
      break;
    case 'haha':
      stats.hahas++;
      break;
    case 'comment': {
      const modal = new ModalBuilder()
        .setCustomId(`commentModal_${interaction.message.id}`)
        .setTitle('💬 Commenter')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('commentText')
              .setLabel("📝 Keteb comment mta3ek")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          )
        );
      return await interaction.showModal(modal);
    }
  }

  const total = stats.likes + stats.loves + stats.hahas || 1;
  const likePercent = Math.round((stats.likes / total) * 100);
  const lovePercent = Math.round((stats.loves / total) * 100);
  const hahaPercent = Math.round((stats.hahas / total) * 100);

  const newEmbed = EmbedBuilder.from(stats.message.embeds[0])
    .setImage(stats.message.embeds[0].data.image.url) // Keep the image
    .setDescription(`\n**📊 Reactions:**\n👍 ${likePercent}%   ❤️ ${lovePercent}%   😂 ${hahaPercent}%\n**💬 Comments:** ${stats.comments}`); // Place percentages below the image

  await stats.message.edit({ embeds: [newEmbed] });
  await interaction.reply({ content: `✅ Reac mte3ek (${interaction.component.label}) t3addet!`, ephemeral: true });
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isModalSubmit()) return;

  const embedMessageId = interaction.customId.split('_')[1];
  const stats = messageStats.get(embedMessageId);
  if (!stats) return;

  const comment = interaction.fields.getTextInputValue('commentText');

  // If no thread exists, create one
  if (!stats.thread) {
    stats.thread = await stats.message.startThread({
      name: `💬 Comments`,
      autoArchiveDuration: 1440, // 24h
    });
  }

  stats.comments++;

  const total = stats.likes + stats.loves + stats.hahas || 1;
  const likePercent = Math.round((stats.likes / total) * 100);
  const lovePercent = Math.round((stats.loves / total) * 100);
  const hahaPercent = Math.round((stats.hahas / total) * 100);

  const updatedEmbed = EmbedBuilder.from(stats.message.embeds[0])
    .setImage(stats.message.embeds[0].data.image.url) // Keep the image
    .setDescription(`\n**📊 Reactions:**\n👍 ${likePercent}%   ❤️ ${lovePercent}%   😂 ${hahaPercent}%\n**💬 Comments:** ${stats.comments}`); // Updated percentages below image

  await stats.message.edit({ embeds: [updatedEmbed] });
  await stats.thread.send(`💬 **${interaction.user.username}**: ${comment}`);
  await interaction.reply({ content: '✅ Comment t3adda!', ephemeral: true });
});

















//casino ------------------------------------------------------------------------------------------------------------------------------------



const symbols = ["🍒", "🍋", "🔔", "💎", "⭐"];
let balances = {}; // userId => balance

const shopItems = [
  { name: "🎖️ Bronze Rank", price: 100, roleId: "1366882456476586075" },
  { name: "🥈 Silver Rank", price: 300, roleId: "1366882563876196382" },
  { name: "🥇 Gold Rank", price: 600, roleId: "1366882625251442850" },
  { name: "💎 Diamond Rank", price: 1000, roleId: "1366882665457778729" },
  { name: "👑 Elite Rank", price: 2000, roleId: "1366882700891521115" },
];

client.on('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const userId = message.author.id;
  if (!balances[userId]) balances[userId] = 200; // start balance

  const content = message.content.toLowerCase();

  // يمسح الرسالة إذا كان فيها أمر
  if (["!slot", "!shop", "!bal", "!top"].includes(content)) {
    try {
      await message.delete();
    } catch (err) {
      console.log("❌ Error deleting message:", err.message);
    }
  }

  // --- SLOT GAME ---
  if (content === '!slot') {
    const slot1 = symbols[Math.floor(Math.random() * symbols.length)];
    const slot2 = symbols[Math.floor(Math.random() * symbols.length)];
    const slot3 = symbols[Math.floor(Math.random() * symbols.length)];

    let result = `${slot1} | ${slot2} | ${slot3}`;
    let reward = 0;

    if (slot1 === slot2 && slot2 === slot3) {
      reward = 100;
    } else if (slot1 === slot2 || slot2 === slot3 || slot1 === slot3) {
      reward = 40;
    } else {
      reward = -20;
    }

    balances[userId] += reward;

    const embed = new EmbedBuilder()
      .setTitle("🎰 Slot Machine")
      .setDescription(`> ${result}\n\n💰 **Result**: ${reward >= 0 ? "+" : ""}${reward}\n💵 **Balance**: ${balances[userId]}`)
      .setColor(reward > 0 ? 0x00ff00 : 0xff0000);

    return message.channel.send({ embeds: [embed] });
  }

  // --- HELP ---
  if (content === '!help') {
    try {
      await message.delete(); // Delete user's message

      const helpEmbed = new EmbedBuilder()
        .setTitle("📜 Commands List")
        .setColor(0x3498db)
        .setDescription("Here is the list of available commands:")
        .addFields(
          { name: '🎰 !slot', value: 'Play the slot machine and win or lose money.' },
          { name: '💵 !bal', value: 'Check your current balance.' },
          { name: '🛒 !shop', value: 'View the shop to buy ranks using your money.' },
          { name: '❓ !help', value: 'Shows this help list.' },
          { name: '🏆 !top', value: 'View the top players with the most balance.' }
        )
        .setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.displayAvatarURL() });

      return message.channel.send({ embeds: [helpEmbed] });
    } catch (err) {
      console.log("❌ Error in !help:", err.message);
    }
  }

  // --- BALANCE ---
  if (content === '!bal') {
    const embed = new EmbedBuilder()
      .setTitle("💵 Balance")
      .setDescription(`> Your balance: **${balances[userId]}**`)
      .setColor(0xffff00);

    return message.channel.send({ embeds: [embed] });
  }

  // --- SHOP ---
  if (content === '!shop') {
    const embed = new EmbedBuilder()
      .setTitle("🛒 Shop - Buy Ranks")
      .setDescription(
        shopItems
          .map((item, i) => `**${item.name}** - 💵 ${item.price}`)
          .join("\n")
      )
      .setColor(0x00bfff);

    const row = new ActionRowBuilder().addComponents(
      shopItems.map((item, index) =>
        new ButtonBuilder()
          .setCustomId(`buy_${index}`)
          .setLabel(`Buy ${item.name.split(" ")[1]}`)
          .setStyle(ButtonStyle.Primary)
      )
    );

    return message.channel.send({ embeds: [embed], components: [row] });
  }

// --- TOP PLAYERS ---
if (content === '!top') {
  // Sort the balances in descending order
  const topPlayers = Object.entries(balances)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10); // Get top 10 players

  const embed = new EmbedBuilder()
    .setTitle("🏆 Top Players")
    .setDescription("Here are the top 10 players with the highest balance:")
    .setColor(0x00ff00)
    .addFields(
      await Promise.all(topPlayers.map(async ([userId, balance], index) => {
        const user = await client.users.fetch(userId); // Fetch user by ID
        return {
          name: `${index + 1}. ${user.tag}`, // Mention player using tag (name#1234)
          value: `💵 ${balance}`,
          inline: true,
        };
      }))
    )
    .setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.displayAvatarURL() });

  return message.channel.send({ embeds: [embed] });
}
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;


  const userId = interaction.user.id;
  const member = await interaction.guild.members.fetch(userId);
  const index = parseInt(interaction.customId.split("_")[1]);
  const item = shopItems[index];

  if (!balances[userId] || balances[userId] < item.price) {
    return interaction.reply({ content: `❌ Ma 3andekch flous! You need 💵 ${item.price}`, ephemeral: true });
  }

  if (member.roles.cache.has(item.roleId)) {
    return interaction.reply({ content: `❌ You already have this rank.`, ephemeral: true });
  }

  balances[userId] -= item.price;
  await member.roles.add(item.roleId);

  interaction.reply({
    content: `✅ Bravo! You bought **${item.name}** for 💵 ${item.price}\nRemaining balance: 💰 ${balances[userId]}`,
    ephemeral: true
  });
});



//invite traker -------------------------------------------------------------------------------------------------------------------------




const invites = new Map(); // ✅ define global invite map

client.once('ready', async () => {
  console.log(`✅ Bot ready as ${client.user.tag}`);

  for (const [guildId, guild] of client.guilds.cache) {
    try {
      const guildInvites = await guild.invites.fetch();
      invites.set(guild.id, guildInvites);
    } catch (err) {
      console.error(`❌ Error fetching invites for ${guild.name}:`, err);
    }
  }
});

client.on('inviteCreate', async invite => {
  try {
    const guildInvites = await invite.guild.invites.fetch();
    invites.set(invite.guild.id, guildInvites);
  } catch (err) {
    console.error('❌ Error in inviteCreate:', err);
  }
});

client.on('guildMemberAdd', async member => {
  try {
    const cachedInvites = invites.get(member.guild.id);
    const newInvites = await member.guild.invites.fetch();
    invites.set(member.guild.id, newInvites);

    const inviteUsed = newInvites.find(inv => {
      const cached = cachedInvites?.get(inv.code);
      return cached && inv.uses > cached.uses;
    });

    let inviter = 'Unknown';
    let uses = 0;
    let inviteCode = 'Unknown';

    if (inviteUsed) {
      inviter = inviteUsed.inviter?.tag || 'Unknown';
      uses = inviteUsed.uses;
      inviteCode = inviteUsed.code;
    } else {
      const vanity = await member.guild.fetchVanityData().catch(() => null);
      if (vanity?.code) {
        inviter = 'Vanity URL';
        uses = vanity.uses || 0;
        inviteCode = vanity.code;
      }
    }

    // ✉️ نبعث إنڤايت جديد للشانيل الآخر
    const inviteChannel = await member.guild.channels.fetch('1366363490947829851');
    if (inviteChannel && inviteChannel.isTextBased()) {
      const invite = await inviteChannel.createInvite({ maxAge: 0, maxUses: 0, reason: 'Auto invite for new member' });
      inviteChannel.send(`🎉 Welcome <@${member.id}>! Here’s your invite: https://discord.gg/${invite.code}`);
    }

    // 📝 نسجل اللوج في الشانيل المخصص
    const logEmbed = new EmbedBuilder()
      .setTitle('📥 New Member Joined')
      .addFields(
        { name: '👤 Member', value: `<@${member.id}>`, inline: true },
        { name: '📨 Invited by', value: inviter, inline: true },
        { name: '🔢 Total Invites by User', value: `${uses}`, inline: true },
        { name: '🔗 Invite Link Used', value: `https://discord.gg/${inviteCode}` }
      )
      .setColor('Green')
      .setTimestamp();

    const logChannel = await member.guild.channels.fetch('1366363258847625247');
    if (logChannel && logChannel.isTextBased()) {
      logChannel.send({ embeds: [logEmbed] });
    }

  } catch (err) {
    console.error('❌ Error in guildMemberAdd:', err);
  }
});

//join&left log server ----------------------------------------------------------------------------------------------------



const LOG_CHANNEL_ID = '1366363492361179246';

client.on(Events.GuildMemberAdd, async (member) => {
    const logChannel = member.guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return;

    const embed = new EmbedBuilder()
        .setTitle('✅ Member Joined')
        .setDescription(`👤 ${member.user.tag} joined the server.`)
        .setColor('Green')
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();

    logChannel.send({ embeds: [embed] });
});

client.on(Events.GuildMemberRemove, async (member) => {
    const logChannel = member.guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return;

    const embed = new EmbedBuilder()
        .setTitle('❌ Member Left')
        .setDescription(`👤 ${member.user.tag} left the server.`)
        .setColor('Red')
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();

    logChannel.send({ embeds: [embed] });
});














//token---------------------------------------------------------------------------------------------------------------


client.config = require('./config.json'); 
client.login(client.config.token); 
client.on('error', console.error);
client.on('warn', console.warn);