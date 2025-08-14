/********************************************************************
 *  Discord Moderation + Subscription + Ticket Bot
 *  ---------------------------------------------------------------
 *  Features:
 *   • All original moderation commands (mute, purge, lock, …)
 *   • /subscription – give/extend a subscription (stores key & expiry)
 *   • /panel       – private embed with subscription info + Show Key
 *   • /purchase    – embed with Create Ticket button → private ticket channel
 *
 *  New: role 1405035087703183492 can now use /panel (and any other
 *  command that passes the normal permission check).
 *
 *  Replace the placeholder values (MOD_ROLE_ID, OWNER_IDS, etc.) with
 *  your own IDs.  The ticket category is set to 1364388755091492955.
 ********************************************************************/

require('dotenv').config();

const {
    Client,
    Events,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    PermissionOverwriteOptions,
} = require('discord.js');

const axios = require('axios');               // optional – only if you call a real API
const crypto = require('crypto');             // built‑in, for local key generation

/* --------------------------- CONFIG --------------------------- */
const MOD_ROLE_ID   = '1398413061169352949';               // moderator role ID
const OWNER_IDS     = ['YOUR_DISCORD_USER_ID'];           // bot owners
const PANEL_ROLE_ID = '1405035087703183492';              // **new** – can use /panel
const TICKET_CAT_ID = '1364388755091492955';              // ticket category ID
/* ------------------------------------------------------------ */

/* --------------------------- CLIENT -------------------------- */
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration,
    ],
});
/* ------------------------------------------------------------ */

/* ----------------------- PERMISSION HELP -------------------- */
/**
 * General permission check used for most commands.
 * Returns true if the member is:
 *   • a bot owner
 *   • has the moderator role
 *   • has the special panel role (so they can also run /panel)
 */
function hasPermission(member) {
    if (OWNER_IDS.includes(member.id)) return true;
    if (member.roles.cache.has(MOD_ROLE_ID)) return true;
    if (member.roles.cache.has(PANEL_ROLE_ID)) return true; // <-- new line
    return false;
}

/**
 * Specific check for the /panel command.
 * If you ever want the panel role to be *only* able to run /panel,
 * replace the call to `hasPermission` inside the /panel block
 * with this function.
 */
function canUsePanel(member) {
    return OWNER_IDS.includes(member.id) ||
           member.roles.cache.has(MOD_ROLE_ID) ||
           member.roles.cache.has(PANEL_ROLE_ID);
}
/* ------------------------------------------------------------ */

/* ---------------------- IN‑MEMORY STORES ------------------- */
const warnings        = new Map();   // userId => [{reason, moderator, timestamp}, …]
const subscriptions   = new Map();   // userId => { expires: Date, key: string }
const temporaryLocks  = new Map();   // channelId => { unlockTime, moderator, reason }
/* ------------------------------------------------------------ */

/* ---------------------- BACKEND HELPERS -------------------- */
/**
 * Retrieve (or generate) a secret key for a user.
 * Replace this with a real API call if you have one.
 */
async function fetchKeyFromBackend(userId) {
    // Return already‑saved key if we have it
    if (subscriptions.has(userId) && subscriptions.get(userId).key) {
        return subscriptions.get(userId).key;
    }

    // ---- Example remote call (uncomment & adapt) -------------
    // try {
    //   const { data } = await axios.get(`https://my‑api.example.com/key/${userId}`);
    //   return data.key; // API must return { key: "…" }
    // } catch (e) {
    //   console.error('Backend key request failed', e);
    // }
    // ---------------------------------------------------------

    // Fallback: generate a pseudo‑random key locally
    const randomPart = crypto.randomBytes(4).toString('hex');
    return `${userId}-${Date.now()}-${randomPart}`;
}

/**
 * Create or extend a subscription.
 * `days` = number of days to add (0 = remove/expire).
 */
async function setSubscription(userId, days) {
    const now = Date.now();
    const existing = subscriptions.get(userId);
    const base = existing?.expires?.getTime() ?? now;
    const newExpire = new Date(base + days * 24 * 60 * 60 * 1000);
    const key = await fetchKeyFromBackend(userId);

    subscriptions.set(userId, { expires: newExpire, key });

    // ---- OPTIONAL: sync with a real backend -----------------
    // try {
    //   await axios.post('https://my‑api.example.com/subscription', {
    //     userId,
    //     expires: newExpire.toISOString(),
    //     key,
    //   });
    // } catch (e) {
    //   console.error('Failed to sync subscription', e);
    // }
    // ---------------------------------------------------------

    return { expires: newExpire, key };
}

/**
 * Human‑readable expiration string.
 */
function formatExpiration(date) {
    if (!date) return 'No active subscription';
    const now = Date.now();
    if (date.getTime() <= now) return 'Expired';
    const diff = date.getTime() - now;
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    return `${days}d ${hours}h`;
}
/* ------------------------------------------------------------ */

/* ---------------------- COMMAND DEFINITIONS ----------------- */
const commands = [
    // ── Existing moderation commands (unchanged) ──
    new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Mute a user')
        .addUserOption(o => o.setName('user').setDescription('The user to mute').setRequired(true))
        .addIntegerOption(o => o.setName('duration').setDescription('Duration in minutes (default: 10)').setRequired(false))
        .addStringOption(o => o.setName('reason').setDescription('Reason for mute').setRequired(false)),

    new SlashCommandBuilder()
        .setName('unmute')
        .setDescription('Unmute a user')
        .addUserOption(o => o.setName('user').setDescription('The user to unmute').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason for unmute').setRequired(false)),

    new SlashCommandBuilder()
        .setName('purge')
        .setDescription('Delete messages from channel (up to 250)')
        .addIntegerOption(o => o.setName('amount').setDescription('Number of messages to delete (1‑250)').setRequired(true)),

    new SlashCommandBuilder()
        .setName('purgehumans')
        .setDescription('Delete messages from humans only (up to 250)')
        .addIntegerOption(o => o.setName('amount').setDescription('Number of messages to check (1‑250)').setRequired(true)),

    new SlashCommandBuilder()
        .setName('purgebots')
        .setDescription('Delete messages from bots only (up to 250)')
        .addIntegerOption(o => o.setName('amount').setDescription('Number of messages to check (1‑250)').setRequired(true)),

    new SlashCommandBuilder()
        .setName('lock')
        .setDescription('Lock the current channel temporarily')
        .addIntegerOption(o => o.setName('duration').setDescription('Duration in minutes (0 = permanent)').setRequired(false).setMinValue(0))
        .addStringOption(o => o.setName('reason').setDescription('Reason for locking the channel').setRequired(false)),

    new SlashCommandBuilder()
        .setName('unlock')
        .setDescription('Unlock the current channel'),

    new SlashCommandBuilder()
        .setName('slowmode')
        .setDescription('Set slowmode for the current channel')
        .addIntegerOption(o => o.setName('seconds')
            .setDescription('Seconds between messages (0 to disable)')
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(21600)),

    new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Warn a user')
        .addUserOption(o => o.setName('user').setDescription('The user to warn').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason for warning').setRequired(true)),

    new SlashCommandBuilder()
        .setName('clearuser')
        .setDescription('Delete messages from a specific user')
        .addUserOption(o => o.setName('user').setDescription('The user whose messages to delete').setRequired(true))
        .addIntegerOption(o => o.setName('amount')
            .setDescription('Number of messages to check (1‑100)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(100)),

    new SlashCommandBuilder()
        .setName('addrole')
        .setDescription('Add a role to a user')
        .addUserOption(o => o.setName('user').setDescription('The user to add role to').setRequired(true))
        .addRoleOption(o => o.setName('role').setDescription('The role to add').setRequired(true)),

    new SlashCommandBuilder()
        .setName('removerole')
        .setDescription('Remove a role from a user')
        .addUserOption(o => o.setName('user').setDescription('The user to remove role from').setRequired(true))
        .addRoleOption(o => o.setName('role').setDescription('The role to remove').setRequired(true)),

    new SlashCommandBuilder()
        .setName('nick')
        .setDescription("Change a user's nickname")
        .addUserOption(o => o.setName('user').setDescription('The user to change nickname for').setRequired(true))
        .addStringOption(o => o.setName('nickname').setDescription('New nickname (leave empty to reset)').setRequired(false)),

    new SlashCommandBuilder()
        .setName('topic')
        .setDescription('Set the channel topic')
        .addStringOption(o => o.setName('text').setDescription('New channel topic').setRequired(true)),

    new SlashCommandBuilder()
        .setName('announce')
        .setDescription('Make an announcement')
        .addStringOption(o => o.setName('message').setDescription('Announcement message').setRequired(true))
        .addChannelOption(o => o.setName('channel').setDescription('Channel to send announcement to').setRequired(false)),

    // ── NEW: /subscription ──
    new SlashCommandBuilder()
        .setName('subscription')
        .setDescription('Give or extend a subscription for a user')
        .addUserOption(o => o.setName('user').setDescription('User to give a subscription to').setRequired(true))
        .addIntegerOption(o => o.setName('days')
            .setDescription('Number of days (positive to add, 0 to remove)')
            .setRequired(true)
            .setMinValue(0))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .setDMPermission(false),

    // ── NEW: /panel ──
    new SlashCommandBuilder()
        .setName('panel')
        .setDescription('Show your subscription panel')
        .addUserOption(o => o.setName('user')
            .setDescription('Show panel for another user (mods only)')
            .setRequired(false)),

    // ── NEW: /purchase ──
    new SlashCommandBuilder()
        .setName('purchase')
        .setDescription('Show purchase info and open a ticket')
        .setDMPermission(false),

].map(c => c.toJSON());
/* ------------------------------------------------------------ */

/* --------------------------- REST --------------------------- */
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
/* ------------------------------------------------------------ */

/* --------------------------- READY -------------------------- */
client.once(Events.ClientReady, async () => {
    console.log(`Ready! Logged in as ${client.user.tag}`);

    // Clear any temporary locks that survived a restart
    temporaryLocks.clear();

    try {
        console.log('Refreshing application (/) commands...');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (err) {
        console.error('Error while registering commands:', err);
    }
});
/* ------------------------------------------------------------ */

/* ---------------------- INTERACTION HANDLER ----------------- */
client.on(Events.InteractionCreate, async interaction => {
    // We only care about slash commands and button clicks
    if (!interaction.isChatInputCommand() && !interaction.isButton()) return;

    const { commandName, options, member, channel, guild } = interaction;

    // ----- Permission check (for slash commands) -----
    if (interaction.isChatInputCommand() && !hasPermission(member)) {
        return await interaction.reply({
            content: '❌ You don’t have permission to use this command! You need the Moderator role, the special panel role, or be a bot owner.',
            ephemeral: true,
        });
    }

    try {
        /* =========================================================
         *  1️⃣  ORIGINAL MODERATION COMMANDS (unchanged)
         * ========================================================= */
        // ---------------- MUTE ----------------
        if (commandName === 'mute') {
            const user = options.getUser('user');
            const duration = options.getInteger('duration') || 10;
            const reason = options.getString('reason') || 'No reason provided';
            const targetMember = await guild.members.fetch(user.id);

            if (!targetMember.moderatable) {
                return await interaction.reply({ content: '❌ I cannot mute this user! Make sure my role is higher than theirs.', ephemeral: true });
            }
            if (OWNER_IDS.includes(targetMember.id)) {
                return await interaction.reply({ content: '❌ You cannot mute the bot owner!', ephemeral: true });
            }

            const muteMs = duration * 60 * 1000;
            await targetMember.timeout(muteMs, reason);
            await interaction.reply({
                content: `✅ <@${user.id}> has been muted for ${duration} minute(s).\n**Reason:** ${reason}\n**Moderator:** <@${member.id}>`,
            });
            try { await user.send(`You have been muted in ${guild.name} for ${duration} minute(s).\n**Reason:** ${reason}\n**Moderator:** <@${member.id}>`); } catch (_) {}
        }

        // ---------------- UNMUTE ----------------
        else if (commandName === 'unmute') {
            const user = options.getUser('user');
            const reason = options.getString('reason') || 'No reason provided';
            const targetMember = await guild.members.fetch(user.id);

            if (!targetMember.isCommunicationDisabled()) {
                return await interaction.reply({ content: '❌ This user is not currently muted!', ephemeral: true });
            }

            await targetMember.timeout(null);
            await interaction.reply({
                content: `✅ <@${user.id}> has been unmuted.\n**Reason:** ${reason}\n**Moderator:** <@${member.id}>`,
            });
            try { await user.send(`You have been unmuted in ${guild.name}.\n**Reason:** ${reason}\n**Moderator:** <@${member.id}>`); } catch (_) {}
        }

        // ---------------- PURGE (all) ----------------
        else if (commandName === 'purge') {
            let amount = options.getInteger('amount');
            if (amount < 1 || amount > 250) return await interaction.reply({ content: '❌ Amount must be 1‑250.', ephemeral: true });

            await interaction.deferReply({ ephemeral: true });
            let deleted = 0, remaining = amount;

            while (remaining > 0) {
                const batch = Math.min(remaining, 100);
                const fetched = await channel.messages.fetch({ limit: batch });
                if (!fetched.size) break;
                await channel.bulkDelete(fetched, true);
                deleted += fetched.size;
                remaining -= batch;
                if (remaining > 0) await new Promise(r => setTimeout(r, 1000));
            }

            const reply = await interaction.editReply({ content: `✅ Deleted ${deleted} message(s).` });
            setTimeout(() => reply.delete().catch(() => {}), 5000);
        }

        // ---------------- PURGE HUMANS ----------------
        else if (commandName === 'purgehumans') {
            let amount = options.getInteger('amount');
            if (amount < 1 || amount > 250) return await interaction.reply({ content: '❌ Amount must be 1‑250.', ephemeral: true });

            await interaction.deferReply({ ephemeral: true });
            let deleted = 0, remaining = amount, checked = 0;

            while (remaining > 0 && checked < 1000) {
                const batch = Math.min(remaining, 100);
                const fetched = await channel.messages.fetch({ limit: batch });
                if (!fetched.size) break;
                const humans = fetched.filter(m => !m.author.bot);
                if (humans.size) {
                    await channel.bulkDelete(humans, true);
                    deleted += humans.size;
                }
                checked += fetched.size;
                remaining -= batch;
                if (remaining > 0) await new Promise(r => setTimeout(r, 1000));
            }

            const reply = await interaction.editReply({ content: `✅ Deleted ${deleted} human message(s).` });
            setTimeout(() => reply.delete().catch(() => {}), 5000);
        }

        // ---------------- PURGE BOTS ----------------
        else if (commandName === 'purgebots') {
            let amount = options.getInteger('amount');
            if (amount < 1 || amount > 250) return await interaction.reply({ content: '❌ Amount must be 1‑250.', ephemeral: true });

            await interaction.deferReply({ ephemeral: true });
            let deleted = 0, remaining = amount, checked = 0;

            while (remaining > 0 && checked < 1000) {
                const batch = Math.min(remaining, 100);
                const fetched = await channel.messages.fetch({ limit: batch });
                if (!fetched.size) break;
                const bots = fetched.filter(m => m.author.bot);
                if (bots.size) {
                    await channel.bulkDelete(bots, true);
                    deleted += bots.size;
                }
                checked += fetched.size;
                remaining -= batch;
                if (remaining > 0) await new Promise(r => setTimeout(r, 1000));
            }

            const reply = await interaction.editReply({ content: `✅ Deleted ${deleted} bot message(s).` });
            setTimeout(() => reply.delete().catch(() => {}), 5000);
        }

        // ---------------- LOCK ----------------
        else if (commandName === 'lock') {
            const duration = options.getInteger('duration') || 0; // 0 = permanent
            const reason = options.getString('reason') || 'No reason provided';

            // Deny SEND_MESSAGES for @everyone
            await channel.permissionOverwrites.create(guild.roles.everyone, { SendMessages: false });

            // Ensure owners can still talk
            for (const ownerId of OWNER_IDS) {
                await channel.permissionOverwrites.create(ownerId, { SendMessages: true });
            }

            if (duration > 0) {
                const unlockAt = Date.now() + duration * 60 * 1000;
                await interaction.reply({
                    content: `🔒 <#${channel.id}> locked for ${duration} minute(s).\n**Reason:** ${reason}`,
                });

                // Schedule auto‑unlock
                setTimeout(async () => {
                    try {
                        temporaryLocks.delete(channel.id);
                        await channel.permissionOverwrites.create(guild.roles.everyone, { SendMessages: null });
                        for (const ownerId of OWNER_IDS) {
                            const ow = channel.permissionOverwrites.cache.get(ownerId);
                            if (ow) await ow.delete();
                        }
                        await channel.send(`🔓 <#${channel.id}> automatically unlocked after ${duration} minute(s).`);
                        console.log(`Auto‑unlocked ${channel.name}`);
                    } catch (e) {
                        console.error('Auto‑unlock error:', e);
                    }
                }, duration * 60 * 1000);

                temporaryLocks.set(channel.id, { unlockTime: unlockAt, moderator: member.user.tag, reason });
            } else {
                await interaction.reply({
                    content: `🔒 <#${channel.id}> permanently locked.\n**Reason:** ${reason}`,
                });
            }
        }

        // ---------------- UNLOCK ----------------
        else if (commandName === 'unlock') {
            await channel.permissionOverwrites.create(guild.roles.everyone, { SendMessages: null });
            for (const ownerId of OWNER_IDS) {
                const ow = channel.permissionOverwrites.cache.get(ownerId);
                if (ow) await ow.delete();
            }
            const temp = temporaryLocks.get(channel.id);
            temporaryLocks.delete(channel.id);

            if (temp) {
                await interaction.reply({
                    content: `🔓 <#${channel.id}> unlocked (was locked by ${temp.moderator}).`,
                });
            } else {
                await interaction.reply({
                    content: `🔓 <#${channel.id}> unlocked.`,
                });
            }
        }

        // ---------------- SLOWMODE ----------------
        else if (commandName === 'slowmode') {
            const seconds = options.getInteger('seconds');
            await channel.setRateLimitPerUser(seconds);
            await interaction.reply({
                content: seconds === 0
                    ? `⏱️ Slowmode disabled in <#${channel.id}>.`
                    : `⏱️ Slowmode set to ${seconds}s in <#${channel.id}>.`,
            });
        }

        // ---------------- WARN ----------------
        else if (commandName === 'warn') {
            const user = options.getUser('user');
            const reason = options.getString('reason');
            const targetMember = await guild.members.fetch(user.id);

            if (!warnings.has(user.id)) warnings.set(user.id, []);
            warnings.get(user.id).push({ reason, moderator: member.user.tag, timestamp: new Date() });

            await interaction.reply({
                content: `⚠️ <@${user.id}> warned.\n**Reason:** ${reason}\n**Moderator:** <@${member.id}>`,
            });
            try { await user.send(`You have been warned in ${guild.name}.\n**Reason:** ${reason}\n**Moderator:** <@${member.id}>`); } catch (_) {}
        }

        // ---------------- CLEARUSER ----------------
        else if (commandName === 'clearuser') {
            const user = options.getUser('user');
            const amount = options.getInteger('amount');
            await interaction.deferReply({ ephemeral: true });

            let deleted = 0, remaining = amount, checked = 0;
            while (remaining > 0 && checked < 1000) {
                const batch = Math.min(remaining, 100);
                const fetched = await channel.messages.fetch({ limit: batch });
                if (!fetched.size) break;
                const userMsgs = fetched.filter(m => m.author.id === user.id);
                if (userMsgs.size) {
                    await channel.bulkDelete(userMsgs, true);
                    deleted += userMsgs.size;
                }
                checked += fetched.size;
                remaining -= batch;
                if (remaining > 0) await new Promise(r => setTimeout(r, 1000));
            }

            const reply = await interaction.editReply({ content: `✅ Deleted ${deleted} message(s) from <@${user.id}>.` });
            setTimeout(() => reply.delete().catch(() => {}), 5000);
        }

        // ---------------- ADDROLE ----------------
        else if (commandName === 'addrole') {
            const user = options.getUser('user');
            const role = options.getRole('role');
            const targetMember = await guild.members.fetch(user.id);
            await targetMember.roles.add(role);
            await interaction.reply({ content: `✅ Added role <@&${role.id}> to <@${user.id}>` });
        }

        // ---------------- REMOVEROLE ----------------
        else if (commandName === 'removerole') {
            const user = options.getUser('user');
            const role = options.getRole('role');
            const targetMember = await guild.members.fetch(user.id);
            await targetMember.roles.remove(role);
            await interaction.reply({ content: `✅ Removed role <@&${role.id}> from <@${user.id}>` });
        }

        // ---------------- NICK ----------------
        else if (commandName === 'nick') {
            const user = options.getUser('user');
            const nickname = options.getString('nickname') ?? '';
            const targetMember = await guild.members.fetch(user.id);
            await targetMember.setNickname(nickname);
            await interaction.reply({
                content: nickname
                    ? `✅ Nickname of <@${user.id}> set to **${nickname}**`
                    : `✅ Nickname of <@${user.id}> reset`,
            });
        }

        // ---------------- TOPIC ----------------
        else if (commandName === 'topic') {
            const text = options.getString('text');
            await channel.setTopic(text);
            await interaction.reply({ content: `✅ Channel topic set to: ${text}` });
        }

        // ---------------- ANNOUNCE ----------------
        else if (commandName === 'announce') {
            const message = options.getString('message');
            const targetChannel = options.getChannel('channel') ?? channel;
            await targetChannel.send({
                content: `📢 **Announcement**\n\n${message}\n\n*Posted by <@${member.id}>*`,
            });
            await interaction.reply({ content: `✅ Announcement posted in <#${targetChannel.id}>`, ephemeral: true });
        }

        /* =========================================================
         *  2️⃣  NEW COMMAND: /subscription
         * ========================================================= */
        else if (commandName === 'subscription') {
            const targetUser = options.getUser('user');
            const days = options.getInteger('days');

            // Prevent non‑owners from giving themselves a subscription
            if (targetUser.id === member.id && !OWNER_IDS.includes(member.id)) {
                return await interaction.reply({ content: '❌ You cannot give yourself a subscription.', ephemeral: true });
            }

            const { expires, key } = await setSubscription(targetUser.id, days);

            await interaction.reply({
                content: `✅ <@${targetUser.id}> now has a subscription for **${days}** day(s).\n` +
                         `**Expires:** <t:${Math.floor(expires.getTime() / 1000)}:F>\n` +
                         `*Key:* \`${key}\``,
                ephemeral: true,
            });

            console.log(`${member.user.tag} gave ${targetUser.tag} a ${days}-day subscription (expires ${expires})`);
        }

        /* =========================================================
         *  3️⃣  NEW COMMAND: /panel
         * ========================================================= */
        else if (commandName === 'panel') {
            // If you want the panel role to be the *only* way to use /panel,
            // replace the generic permission check with:
            // if (!canUsePanel(member)) { … }
            // For now we keep the generic check (hasPermission) which already
            // includes the panel role.

            const targetUser = options.getUser('user') ?? member.user;

            // If a moderator tries to view someone else’s panel, they must have permission
            if (targetUser.id !== member.id && !hasPermission(member)) {
                return await interaction.reply({ content: '❌ You can only view your own panel.', ephemeral: true });
            }

            const sub = subscriptions.get(targetUser.id);
            const expires = sub?.expires ?? null;
            const key = sub?.key ?? null;

            const embed = {
                color: 0x2b2d31,
                title: `${targetUser.username}'s Subscription`,
                thumbnail: { url: targetUser.displayAvatarURL({ dynamic: true }) },
                fields: [
                    { name: 'User', value: `<@${targetUser.id}>`, inline: true },
                    {
                        name: 'Expires',
                        value: expires ? `<t:${Math.floor(expires.getTime() / 1000)}:F>` : 'No active subscription',
                        inline: true,
                    },
                    {
                        name: 'Key status',
                        value: key ? '`••••••••` (hidden)' : 'No key',
                        inline: false,
                    },
                ],
                footer: {
                    text: `Requested by ${member.user.username}`,
                    icon_url: member.user.displayAvatarURL({ dynamic: true }),
                },
                timestamp: new Date(),
            };

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`showkey_${targetUser.id}`)
                    .setLabel('Show Key')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(!key)
            );

            await interaction.reply({
                embeds: [embed],
                components: [row],
                ephemeral: true,
            });
        }

        /* =========================================================
         *  4️⃣  NEW COMMAND: /purchase
         * ========================================================= */
        else if (commandName === 'purchase') {
            const embed = {
                color: 0x00ff00,
                title: '🛒 Purchase the Premium Script',
                description: 'Click the button below to open a private ticket where you can discuss the purchase with the staff.',
                footer: { text: 'Ticket will be created in this server' },
                timestamp: new Date(),
            };

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('purchase_createTicket')
                    .setLabel('Create Ticket')
                    .setStyle(ButtonStyle.Success)
            );

            await interaction.reply({
                embeds: [embed],
                components: [row],
                // visible to everyone in the channel (not ephemeral)
            });
        }

        /* =========================================================
         *  5️⃣  BUTTON INTERACTIONS
         * ========================================================= */
        else if (interaction.isButton()) {
            // ---------- SHOW KEY ----------
            if (interaction.customId.startsWith('showkey_')) {
                const targetId = interaction.customId.split('_')[1];
                const sub = subscriptions.get(targetId);

                // Only the owner of the panel (or a bot owner) may see the key
                if (interaction.user.id !== targetId && !OWNER_IDS.includes(interaction.user.id)) {
                    return await interaction.reply({ content: '❌ You are not allowed to view that key.', ephemeral: true });
                }

                if (!sub?.key) {
                    return await interaction.reply({ content: '❌ No key stored for this user.', ephemeral: true });
                }

                await interaction.reply({
                    content: `🔑 **Your key:** \`${sub.key}\`\n🗓️ **Expires:** <t:${Math.floor(sub.expires.getTime() / 1000)}:F>`,
                    ephemeral: true,
                });
            }

            // ---------- CREATE TICKET ----------
            else if (interaction.customId === 'purchase_createTicket') {
                // Prevent duplicate tickets for the same user
                const existing = guild.channels.cache.find(
                    c => c.type === ChannelType.GuildText &&
                         c.name === `ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${interaction.user.id}`
                );

                if (existing) {
                    return await interaction.reply({
                        content: `🗂️ You already have an open ticket: ${existing.toString()}`,
                        ephemeral: true,
                    });
                }

                /** @type {PermissionOverwriteOptions[]} */
                const overwrites = [
                    {
                        id: guild.roles.everyone.id,
                        deny: [PermissionFlagsBits.ViewChannel],
                    },
                    {
                        id: interaction.user.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory,
                        ],
                    },
                    {
                        id: client.user.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ManageChannels,
                            PermissionFlagsBits.ReadMessageHistory,
                        ],
                    },
                ];

                // Give moderators (or the mod role) access as well
                if (MOD_ROLE_ID) {
                    overwrites.push({
                        id: MOD_ROLE_ID,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory,
                        ],
                    });
                }

                const channelName = `ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${interaction.user.id}`;

                const ticketChannel = await guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildText,
                    parent: TICKET_CAT_ID,
                    permissionOverwrites: overwrites,
                    topic: `Purchase ticket opened by ${interaction.user.tag}`,
                });

                await ticketChannel.send({
                    content: `<@${interaction.user.id}> **Welcome!**\nOur staff will be with you shortly. Please describe what you’d like to purchase.`,
                });

                await interaction.reply({
                    content: `✅ Ticket created: ${ticketChannel.toString()}`,
                    ephemeral: true,
                });
            }
        }

        /* =========================================================
         *  END OF COMMAND LOGIC
         * ========================================================= */
    } catch (err) {
        console.error('Interaction error:', err);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ An error occurred while executing the command.', ephemeral: true });
        } else if (interaction.deferred) {
            await interaction.editReply({ content: '❌ An error occurred while executing the command.', ephemeral: true });
        }
    }
});
/* ------------------------------------------------------------ */

/* ------------------- CLEANUP OF EXPIRED SUBSCRIPTIONS ---------------- */
setInterval(() => {
    const now = Date.now();
    for (const [userId, data] of subscriptions.entries()) {
        if (data.expires.getTime() <= now) {
            subscriptions.delete(userId);
            console.log(`Removed expired subscription for ${userId}`);
        }
    }
}, 10 * 60 * 1000); // every 10 minutes
/* ------------------------------------------------------------ */

/* --------------------------- LOGIN -------------------------- */
client.login(process.env.DISCORD_TOKEN);
/* ------------------------------------------------------------ */
