require('dotenv').config();
const { Client, Events, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

// Configuration
const MOD_ROLE_ID = '1398413061169352949';
const OWNER_IDS = ['YOUR_DISCORD_USER_ID']; // Add your Discord user ID here

// Create a new client instance
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration
    ] 
});

// Check if user has permission to use commands
function hasPermission(member) {
    // Check if user is owner
    if (OWNER_IDS.includes(member.id)) return true;
    
    // Check if user has the specific mod role
    if (member.roles.cache.has(MOD_ROLE_ID)) return true;
    
    return false;
}

// Command definitions
const commands = [
    // Mute command
    new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Mute a user')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to mute')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('duration')
                .setDescription('Duration in minutes (default: 10)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for mute')
                .setRequired(false)),

    // Purge all messages
    new SlashCommandBuilder()
        .setName('purge')
        .setDescription('Delete messages from channel')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Number of messages to delete (1-100)')
                .setRequired(true)),

    // Purge human messages only
    new SlashCommandBuilder()
        .setName('purgehumans')
        .setDescription('Delete messages from humans only')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Number of messages to check (1-100)')
                .setRequired(true)),

    // Purge bot messages only
    new SlashCommandBuilder()
        .setName('purgebots')
        .setDescription('Delete messages from bots only')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Number of messages to check (1-100)')
                .setRequired(true))
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// Register commands
client.once(Events.ClientReady, async () => {
    console.log(`Ready! Logged in as ${client.user.tag}`);
    
    try {
        console.log('Started refreshing application (/) commands.');
        
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
});

// Handle interactions
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, member } = interaction;

    // Check permissions
    if (!hasPermission(member)) {
        return await interaction.reply({
            content: '❌ You don\'t have permission to use this command! You need the Moderator role or be the bot owner.',
            ephemeral: true
        });
    }

    try {
        // Mute command
        if (commandName === 'mute') {
            const user = options.getUser('user');
            const duration = options.getInteger('duration') || 10;
            const reason = options.getString('reason') || 'No reason provided';
            
            const targetMember = await interaction.guild.members.fetch(user.id);
            
            if (!targetMember) {
                return await interaction.reply({
                    content: '❌ User not found!',
                    ephemeral: true
                });
            }

            // Check if user can be muted
            if (!targetMember.moderatable) {
                return await interaction.reply({
                    content: '❌ I cannot mute this user! Make sure my role is higher than theirs.',
                    ephemeral: true
                });
            }

            // Check if trying to mute owner or user with higher role
            if (OWNER_IDS.includes(targetMember.id)) {
                return await interaction.reply({
                    content: '❌ You cannot mute the bot owner!',
                    ephemeral: true
                });
            }

            const muteDuration = duration * 60 * 1000; // Convert to milliseconds
            
            await targetMember.timeout(muteDuration, reason);
            
            await interaction.reply({
                content: `✅ ${user.tag} has been muted for ${duration} minutes.\n**Reason:** ${reason}`
            });

            // Send DM to user
            try {
                await user.send(`You have been muted in ${interaction.guild.name} for ${duration} minutes.\n**Reason:** ${reason}`);
            } catch (error) {
                console.log('Could not send DM to user');
            }
        }

        // Purge all messages
        else if (commandName === 'purge') {
            const amount = options.getInteger('amount');

            if (amount < 1 || amount > 100) {
                return await interaction.reply({
                    content: '❌ You need to input a number between 1 and 100!',
                    ephemeral: true
                });
            }

            // Fix for deprecation warning - use flags instead of ephemeral
            await interaction.deferReply({ flags: [64] }); // 64 = EPHEMERAL flag

            try {
                const fetched = await interaction.channel.messages.fetch({ limit: amount });
                await interaction.channel.bulkDelete(fetched, true);

                const reply = await interaction.editReply({
                    content: `✅ Successfully deleted ${fetched.size} messages!`,
                    flags: [64] // EPHEMERAL flag
                });

                // Delete the success message after 5 seconds
                setTimeout(() => {
                    if (reply.deletable) {
                        reply.delete().catch(console.error);
                    }
                }, 5000);
            } catch (error) {
                console.error('Purge error:', error);
                await interaction.editReply({
                    content: '❌ Failed to delete messages. I might not have permission to manage messages in this channel or the messages are too old.',
                    flags: [64]
                });
            }
        }

        // Purge human messages only
        else if (commandName === 'purgehumans') {
            const amount = options.getInteger('amount');

            if (amount < 1 || amount > 100) {
                return await interaction.reply({
                    content: '❌ You need to input a number between 1 and 100!',
                    ephemeral: true
                });
            }

            // Fix for deprecation warning - use flags instead of ephemeral
            await interaction.deferReply({ flags: [64] }); // 64 = EPHEMERAL flag

            try {
                const fetched = await interaction.channel.messages.fetch({ limit: amount });
                const humanMessages = fetched.filter(msg => !msg.author.bot);
                
                await interaction.channel.bulkDelete(humanMessages, true);

                const reply = await interaction.editReply({
                    content: `✅ Successfully deleted ${humanMessages.size} human messages!`,
                    flags: [64] // EPHEMERAL flag
                });

                // Delete the success message after 5 seconds
                setTimeout(() => {
                    if (reply.deletable) {
                        reply.delete().catch(console.error);
                    }
                }, 5000);
            } catch (error) {
                console.error('Purge humans error:', error);
                await interaction.editReply({
                    content: '❌ Failed to delete human messages. I might not have permission to manage messages in this channel or the messages are too old.',
                    flags: [64]
                });
            }
        }

        // Purge bot messages only
        else if (commandName === 'purgebots') {
            const amount = options.getInteger('amount');

            if (amount < 1 || amount > 100) {
                return await interaction.reply({
                    content: '❌ You need to input a number between 1 and 100!',
                    ephemeral: true
                });
            }

            // Fix for deprecation warning - use flags instead of ephemeral
            await interaction.deferReply({ flags: [64] }); // 64 = EPHEMERAL flag

            try {
                const fetched = await interaction.channel.messages.fetch({ limit: amount });
                const botMessages = fetched.filter(msg => msg.author.bot);
                
                await interaction.channel.bulkDelete(botMessages, true);

                const reply = await interaction.editReply({
                    content: `✅ Successfully deleted ${botMessages.size} bot messages!`,
                    flags: [64] // EPHEMERAL flag
                });

                // Delete the success message after 5 seconds
                setTimeout(() => {
                    if (reply.deletable) {
                        reply.delete().catch(console.error);
                    }
                }, 5000);
            } catch (error) {
                console.error('Purge bots error:', error);
                await interaction.editReply({
                    content: '❌ Failed to delete bot messages. I might not have permission to manage messages in this channel or the messages are too old.',
                    flags: [64]
                });
            }
        }

    } catch (error) {
        console.error(error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ There was an error while executing this command!',
                ephemeral: true
            });
        } else if (interaction.deferred) {
            await interaction.editReply({
                content: '❌ There was an error while executing this command!',
                flags: [64]
            });
        }
    }
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN);
