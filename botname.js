// Basic Bot Stuff
var Bot = require('ttapi')

var config = {
    botName: 'Jackie', //this value is crucial in connecting to the db tables. view the query code to understand such as getEnterMsg
    roomName: 'Mix-N-Mash',//only echoed out in commands, no functionality
    roomTheme: 'Mash-Ups or Remixes', //only echoed out in commands, no functionality
    openDate: '10/11/12', //only echoed out in commands, no functionality
    fbLink: 'http://on.fb.me/Q1SywN', //only echoed out in commands, no functionality
    tinyLink: 'http://tinychat.com/mixmash', //only echoed out in commands, no functionality
    //the above lines are custom to your room, change these values as they get echoed out in rules, newgreets and such.
    botGreetings: ['/', 'bot ', 'bot', 'jackie ', 'Jackie ', 'AuntJackie ', 'jac', 'j'],
    botGreetingsGeneric: ['/', 'bot ', 'bot', 'jackie ', 'Jackie ', 'AuntJackie ', 'jac', 'j', 'j '],
    botOwner: 'bot Owner userid here',
    JBIRD: '',//secondary override for running other bots **not currently working in this version.
    auth: 'xxxx', //find out auth, userid, and room id with this http://alaingilbert.github.com/Turntable-API/bookmarklet.html
    userid: 'xxxx',
    roomid: 'xxxx', 
    battlebot: 'xxxx',//excludes another bot in the room.
    port: 1337,
    usedb: true,
    addStats: true,
    dbhost: 'localhost',
    dbname: 'jackie',
    dbusername: 'root',
    dbpassword: 'xxxx',
    perGreetings: true,
    newgreets: true,
    useDjq: true,
    games: true,
    sexy: true,
    startTime: new Date(),
    autobop: false,
    autobot: false,
    autoDj: true,
    afkCheck: true,
    afkMin: 10, //default value for afk checking
    songTimer: true,
    songLimit: 8,
    deckHours: 2,
    deckcheck: true,
    songCheck: false,
    deckPlays: 2,
    danceMode: true,
    followMe: false,
    debug: false,
    holdMode: false,
    watchMode: false,
    crowdCheck: true,
    inactiveLimit: 4,
    deckControl: false,
    enterPM: true,
    enterMsg: "***Join the MnM FB group: http://on.fb.me/Q1SywN",
    newMode: false
};

// Modules
var botBase = require('./lib/bot_base.js');
var mysql = require('mysql');

//Initializes request module
try {
    request = require('request');
} catch (e) {
    console.log(e);
    console.log('It is likely that you do not have the request node module installed.'
			+ '\nUse the command \'npm install request\' to install.');
    process.exit(33);
}

//Connects to mysql server
if (config.usedb) {
    try {
        mysql = require('mysql');
    } catch(e) {
        console.log(e);
        console.log('It is likely that you do not have the mysql node module installed.'
            + '\nUse the command \'npm install mysql\' to install.');
        console.log('Starting bot without database functionality.');
        config.usedb = false;
    }

    //Connects to mysql server
    try {
        client = mysql.createClient({user: config.dbusername, password: config.dbpassword, database: config.dbname, host: config.dbhost});
        } catch(e) {
        console.log(e);
        console.log('Make sure that a mysql server instance is running and that the username and password information are correct.');
        console.log('Starting bot without database functionality.');
        config.usedb = false;
    }
}

// Create Bot
var bot = new Bot(config.auth, config.userid);

var botObj = {
    'config': config,
    'bot': bot
}

/* ===== REQUIRED MODULES ====== */
// init base bot
botBase.init(botObj);


/* ===== OPTIONAL MODULES ===== */
// init server listening
var httpServer = require('./lib/server-http.js');
botObj.commands = botBase.commands;
httpServer.init(botObj);
bot.listen(config.port, '127.0.0.1');