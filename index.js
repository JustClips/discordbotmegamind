require('dotenv').config();
const { Client, Events, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

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
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    // Purge all messages
    new SlashCommandBuilder()
        .setName('purge')
        .setDescription('Delete messages from channel')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Number of messages to delete (1-100)')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    // Purge human messages only
    new SlashCommandBuilder()
        .setName('purgehumans')
        .setDescription('Delete messages from humans only')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Number of messages to check (1-100)')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    // Purge bot messages only
    new SlashCommandBuilder()
        .setName('purgebots')
        .setDescription('Delete messages from bots only')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Number of messages to check (1-100)')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
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
    if (!member.permissions.has(PermissionFlagsBits.ManageMessages) && 
        (commandName.includes('purge') || commandName === 'mute')) {
        return await interaction.reply({
            content: '❌ You don\'t have permission to use this command!',
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
                    content: '❌ I cannot mute this user!',
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
                await 
