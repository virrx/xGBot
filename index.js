const Discord = require('discord.js');
const client = new Discord.Client();
const fs = require('fs');
const RssFeedEmitter = require('rss-feed-emitter');
const feeder = new RssFeedEmitter();

var config = require('./configs/config.json');
var roles = require('./configs/roles.json');
var countWhitelist = require('./configs/countWhitelist.json');
var colors = require('./configs/colors.json');
const cooldownConfig = require('./configs/roleCooldowns.json');

var guild;
var countChannel;
var roleChannel;
var announcementChannel;

var countContentGeneral = '';
var countContentStaff = '';
var countContentNotifications = '';
var countContentColors = '';

var countMessage;
var roleMessage;

const countEmbed = {
    "embed": {
        "title": "Member Count",
        "color": 0x56c9ec,
        "thumbnail": {
            "url": "https://i.imgur.com/vTlvD0n.png"
        },
        "fields": [
            {
                "name": "General",
                "value": "ok",
                "inline": true
            },
            {
                "name": "Staff",
                "value": "ok",
                "inline": true
            },
            {
                "name": "Notifications",
                "value": "ok",
                "inline": true
            },
            {
                "name": "10 Most Used Colors",
                "value": "ok",
                "inline": true
            }
        ]
    }
}

const roleEmbed = new Discord.RichEmbed()
    .setDescription('React to get a role!')
    .setColor(0x56c9ec)
    .setAuthor('Roles')
    .setFooter('Xeno Gamers', 'https://i.imgur.com/vTlvD0n.png');

feeder.add({
    url: 'https://xenogamers.com/discover/all.xml/'
});

client.login(config.loginToken);

client.on('error', error => console.error(error.message));

let cooldowns = [];

client.on('ready', function() {
    console.log('Ready');

    guild = client.guilds.get(config.guildID);
    countChannel = client.channels.get(config.countChannelID);
    roleChannel = client.channels.get(config.roleChannelID);
    announcementChannel = client.channels.get(config.announcementChannelID);

    for(var emoji in roles) {
        roleEmbed.addField(emoji, guild.roles.get(roles[emoji].role), true);
    }

    if(config.countMessageID == '') {
        countChannel.send(countEmbed);
    } else {
        countChannel.fetchMessage(config.countMessageID)
            .then(message => countMessage = message)
            .catch(console.error);
    }

    if(config.roleMessageID == '') {
        roleChannel.send(roleEmbed);
    } else {
        roleChannel.fetchMessage(config.roleMessageID)
            .then(message => roleMessage = message)
            .catch(console.error);
    }

    cooldownConfig.roleIds.forEach(e => {
        cooldowns.push({ name: e.name, roleId: e.id, timeout: null, interval: null, cooldownModifier: 0 });
        var role = guild.roles.get(e.id);
        if (role) {
            role.edit({ mentionable: true });
        }
    });
});

/**
 * ROLE MENTION COOLDOWNS
 * Role cooldowns will begin at base, and if tagged within the base time again will increase
 * the cooldown by the interval value, capped at max modifier times interval. The cooldown time will decrease
 * by the interval value every base.
 */
client.on('message', message => {
    cooldowns.forEach(cd => {
        /*
         * cd: { 
         *  name: human readable role name,
         *  id: discord role id,
         *  timeout: for re-enabling after the cooldown
         *  interval: for decreasing modifier after cooldown expires
         *  cooldownModifier: amount to increase base cooldown by
         * }
         */

        if(message.mentions.roles.has(cd.roleId)) {
            console.log(`Message mentioned ${cd.name}, had cooldownModifier ${cd.cooldownModifier}`);
            guild.roles.get(cd.roleId).edit({ mentionable: false });
            message.channel.send(`${cd.name} cooldown is now ${cooldownConfig.baseMinutes + (cd.cooldownModifier * cooldownConfig.intervalMinutes)} minutes.`);
            clearInterval(cd.interval);
            clearTimeout(cd.timeout);
            let delay = 60 * 1000 * (cooldownConfig.baseMinutes + (cd.cooldownModifier * cooldownConfig.intervalMinutes));
            cd.timeout = setTimeout(cd => {
                console.log(`Re enabling mentioning for ${cd.name}, modifier ${cd.cooldownModifier}`);
                guild.roles.get(cd.roleId).edit({ mentionable: true });

                console.log(`Setting interval for ${cooldownConfig.baseMinutes}`);
                clearInterval(cd.interval);
                cd.interval = setInterval(cd => {
                    console.log(`Decreasing cd modifier for ${cd.name}, had modifier ${cd.cooldownModifier}`);
                    cd.cooldownModifier = Math.max(cd.cooldownModifier - 1, 0);
                    console.log(`Modifier now ${cd.cooldownModifier}`);

                    if(cd.cooldownModifier <= 0) {
                        console.log(`Stopping interval, at min modifier`);
                        clearInterval(cd.interval);
                    }
                }, cooldownConfig.baseMinutes * 60 * 1000, cd);
            }, delay, cd);

            cd.cooldownModifier = Math.min(cd.cooldownModifier + 1, cooldownConfig.maxModifier);
            console.log(`Set a timeout for ${delay}, new cooldownModifier ${cd.cooldownModifier}`);
        }
    });
});

client.on('message', async message => {
    if(message.author.id == client.user.id) {
        if(message.embeds.length > 0) {
            if(message.embeds[0].description == 'React to get a role!') { // if message is our role message
                config.roleMessageID = message.id;
                fs.writeFile('./config.json', JSON.stringify(config), function(err) {
                    if(err) console.log(err);
                });
                roleMessage = message;
                for(var emoji in roles) {
                    var emojiID = emoji.split(':')[2].replace('>','');
                    emojiID = emojiID.replace('<','');
                    message.react(emojiID);
                }
            } else if (message.embeds[0].title == 'Member Count') {
                config.countMessageID = message.id;
                fs.writeFile('./config.json', JSON.stringify(config), function(err) {
                    if(err) console.log(err);
                });
                countMessage = message;
                updateCount();
            }
        }
    } else {
        if(message.channel.id == config.colorChannelID && message.author.id != client.user.id) {
            message.delete();
            var guildAuthor = guild.members.get(message.author.id);
            if(message.content.startsWith('!color ')) {
                var color = message.content.split(' ').slice(1).join('').toLowerCase();
                var hexRole = guildAuthor.roles.find(role => /^#[0-9A-F]{6}$/i.test(role.name));
                if(colors.hasOwnProperty(color)) {
                    if(hexRole !== null) {
                        if(hexRole.members.size <= 1) hexRole.delete();
                        guildAuthor.removeRole(hexRole);
                    }
                    if(guildAuthor.roles.every(checkNoColor)) {
                        guildAuthor.addRole(colors[color].id);
                    } else {
                        var oldColor = guildAuthor.roles.find(role => colors.hasOwnProperty(role.name.replace(' ', '').toLowerCase()));
                        await guildAuthor.removeRole(oldColor.id);
                        await guildAuthor.addRole(colors[color].id);
                    }
                } else if(/^#[0-9A-F]{6}$/i.test(color) && guildAuthor.roles.has(config.boosterRoleID)) {
                    var authorRole = guildAuthor.roles.find(role => /^#[0-9A-F]{6}$/i.test(role.name));
                    var existingRole = guild.roles.find(role => role.name == color);
                    if(!guildAuthor.roles.every(checkNoColor)) {
                        var oldColor = guildAuthor.roles.find(role => colors.hasOwnProperty(role.name.replace(' ', '').toLowerCase()));
                        guildAuthor.removeRole(oldColor.id);
                    }
                    if(authorRole !== null) {
                        if(authorRole.name != color) {
                            if(existingRole !== null) {
                                guildAuthor.addRole(existingRole);
                                if(authorRole.members.size <= 1) {
                                    authorRole.delete();
                                } else {
                                    guildAuthor.removeRole(authorRole);
                                }
                            } else {
                                if(authorRole.members.size <= 1) {
                                    authorRole.edit({
                                        name: color,
                                        color: color
                                    });
                                } else {
                            		var newRole = guild.createRole({
                                        name: color,
                                        color: color,
                                        position: guild.roles.size - 9
                                    })/*.then(guildAuthor.addRole(newRole))*/.catch(console.error);
                                    guildAuthor.removeRole(authorRole).catch(console.error);
                                }
                            }
                        } else {
                            var sent = await message.reply('you already have this role.');
                            setTimeout(async () => {
                                await sent.delete();
                            }, 5000);
                        }
                    } else {
                        if(existingRole !== null) {
                            guildAuthor.addRole(existingRole);
                        } else {
                    		var newRole = guild.createRole({
                                name: color,
                                color: color,
                                position: guild.roles.size - 9
                            })/*.then(guildAuthor.addRole(newRole))*/.catch(console.error);
                        }
                    }
                } else {
                    var sent = await message.reply(`invalid color.`)
                    setTimeout(async () => {
                        await sent.delete();
                    }, 5000);
                }
            } else if(message.content == '!removecolor') {
                var guildAuthor = guild.members.get(message.author.id);
                if(!guildAuthor.roles.every(checkNoColor)) {
                    var oldColor = guildAuthor.roles.find(role => colors.hasOwnProperty(role.name.replace(' ', '').toLowerCase()));
                    guildAuthor.removeRole(oldColor.id);
                } else {
                    message.reply('you have no colors.')
                        .then(sent => setTimeout(function() {
                            sent.delete();
                        }, 5000));
                }
            }
        }
    }
});

client.on('messageReactionAdd', function(reaction, user) {
    if(user != client.user && reaction.message.id == config.roleMessageID) {
        var guildUser = guild.members.get(user.id);
        guildUser.addRole(roles[`<:${reaction.emoji.identifier}>`].role);
    }
});

client.on('messageReactionRemove', function(reaction, user) {
    if(reaction.message.id == config.roleMessageID) {
        var guildUser = guild.members.get(user.id);
        if(guildUser.roles.filter(role => role.id == roles[`<:${reaction.emoji.identifier}>`].role).size > 0) { //gross way of making sure they have the role already
            guildUser.removeRole(roles[`<:${reaction.emoji.identifier}>`].role);
        }
    }
});

client.on('guildMemberAdd', function(member) {
    updateCount();
    member.addRole('553963765641641994');
});

client.on('guildMemberRemove', function() {
    updateCount();
});

client.on('guildMemberUpdate', function(oldMember, newMember) {
    updateCount();
    if(newMember.roles.some(role => role.name == 'Normie' && role.name == 'Member' || role.name == 'Friend of xG')) {
        newMember.removeRole('553963765641641994')
    }
});

feeder.on('new-item', function(item) {
    if(item.title.includes('Promotions and Demotions #') && item.description.includes('This is a reminder to those who have newly gained access as a Moderator to leave your STEAM IDs posted below in the comment section below to ensure the distribution of powers as soon as possible.')) {
        var content = item.description;
        var promos;
        var demos;
        content = content.replace(/\n/g, '');
        content = content.replace(/\t/g, '');
        content = content.replace(/@/g, '\n@');
        content = content.replace(/GMOD/g, '\n**GMOD**');
        content = content.replace(/TF2/g, '\n**TF2**');
        content = content.replace(/CS:GO/g, '\n**CS:GO**')
        content = content.replace(/Minecraft/g, '\n**Minecraft**');
        content = content.replace(/Discord/g, '\n**Discord**');
        content = content.substring(0, content.indexOf(' Congratulations to those who were promoted'));
        if(content.includes('Demotions')) {
            if(content.includes('Promotions')) {
                content = content.replace('Promotions', '');
                promos = content.split(' Demotions ')[0];
                demos = content.split(' Demotions ')[1];
            } else {
                promos = 'No promotions.';
                demos = content;
            }
        } else {
            if(content.includes('Promotions')) {
                content = content.replace('Promotions', '');
                promos = content;
                demos = 'No demotions.';
            } else {
                promos = 'No promotions.';
                demos = 'No demotions.';
            }
        }
        console.log(promos, demos);
        var promoDemoEmbed = {
            "embed": {
                "title": item.title,
                "url": item.link,
                "color": 5998561,
                "fields": [
                    {
                        "name": "Promotions",
                        "value": promos
                    },
                    {
                        "name": "Demotions",
                        "value": demos
                    }
                ]
            }
        }
        announcementChannel.send(promoDemoEmbed);
    }
});

function updateCount() {
    countContentGeneral = `**Total**: ${guild.memberCount}\n`;
    countContentStaff = '';
    countContentNotifications = '';
    countContentColors = '';
    var topColors = [];

    countWhitelist['General'].forEach(function(role) {
        countContentGeneral += `**${role.name}**: ${guild.roles.get(role.id).members.size}\n`;
    });
    countWhitelist['Staff'].forEach(function(role) {
        countContentStaff += `**${role.name}**: ${guild.roles.get(role.id).members.size}\n`;
    });
    countWhitelist['Notifications'].forEach(function(role) {
        countContentNotifications += `**${role.name}**: ${guild.roles.get(role.id).members.size}\n`;
    });
    countWhitelist['Colors'].forEach(function(role) {
        topColors.push({
            name: role.name,
            count: guild.roles.get(role.id).members.size
        });
    });
    topColors.sort(sortByProperty('count'));
    topColors = topColors.slice(0, 10);
    topColors.forEach(function(color) {
        countContentColors += `**${color.name}**: ${color.count}\n`;
    });
    countEmbed.embed.fields[0].value = countContentGeneral;
    countEmbed.embed.fields[1].value = countContentStaff;
    countEmbed.embed.fields[2].value = countContentNotifications;
    countEmbed.embed.fields[3].value = countContentColors;
    countMessage.edit(countEmbed);
}

function checkNoColor(role) {
    return (!colors.hasOwnProperty(role.name.replace(' ', '').toLowerCase()));
}

function checkHexRole(role) {
    return /^#[0-9A-F]{6}$/i.test(role.name);
}

var sortByProperty = function (property) {
    return function (x, y) {
        return ((x[property] === y[property]) ? 0 : ((x[property] > y[property]) ? -1 : 1));
    };
};

function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}