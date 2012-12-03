/*global config:true */

var fs = require('fs');
var extend = require('./node.extend');
var util = require('util');
var startTime = new Date();

var debug = false;

if (!debug) {
    /* to hopefully keep bot from crashing */
    process.on('uncaughtException', function (err) {
        botSpeak('console', 'Caught exception: ' + err);
        // TODO: catch if socket was closed and reboot bot...
        if (err === "Error: This socket is closed.") {
            onReady();
        }
    });
}

var bot = null;
var config = null;
var ttRoom = {
    roomMods: [],
    history: [],
    djList: {},
    userList: {},
    recentDjs: {},
    botOnDeck: false,  // true when the bot is on deck
    djHelper: false  // set true when bot is dj'ing in 'help' mode
};

var qLength = 0;
var escortId = null;
var newCount = 0;

var clearq = function () {
    for (i = 0; i < 10; i++) {
        bot.playlistRemove(0);
        botSpeak('console', " removed track " + i);
    }
};

//pm greeting message from db value
var getEnterMsg = function () {
    if (config.usedb) {
        var cmd = "SELECT value FROM " + config.botName + "startup WHERE setting = 'enterPM'";
        client.query(cmd, function (err, results, fields) {
            if (err) { botSpeak('console', err + " getEnterMsg"); }
            if (results) { config.enterMsg = results[0]['value']; } else {
                botSpeak('console', "no results in db for enterPM value");
            }
        });
    };
};

var getQlength = function () {
    if (config.usedb) {
        var cmd = "SELECT count(userid) as count FROM " + config.botName + "djq";
        client.query(cmd, function (err, results, fields) {
            if (err) { botSpeak('console', err + " getQlength"); }
            if (results) {
                qLength = results[0]['count'];
            }
        });
    };
};

var isRoomMod = function (userid) {
    if (ttRoom.roomMods) {
        return ttRoom.roomMods.indexOf(userid) > -1 ? true : false;
    } else {
        return false;
    }
};

var pmMods = function (text, auto) {
    if (config.perGreetings) {
        for (var user in ttRoom.userList) {
            var userObj = ttRoom.userList[user];
            if (isRoomMod(userObj.userid)) {
                if (auto) {  //exclude mods that dont want automated pms joined/lamer
                    if (config.excludeMods.indexOf(userObj.userid) > -1 ? false : true)
                    botSpeak('pm', text, userObj.userid);
                } else {
                    botSpeak('pm', text, userObj.userid);
                }
            }
        }
    }
}

var getPersonalGreet = function (userid) {
    var min = 0;
    var max = null;
    if (config.usedb) {
        var cmd = "SELECT text FROM " + config.botName + "pgreets WHERE (userid = '" + userid + "') ORDER BY rand() LIMIT 1";
        client.query(cmd, function (err, results, fields) {
            if (err) { botSpeak('console', err + " getPersonalGreet"); }
            if ((results) && (results.length > 0) && (results.length !== undefined)) {
                var text = results[0]['text'];
                botSpeak('chat', text);
                response = text;
            }
        });
    };
};

var setEnterMsg = function (Msg) {
    if (config.usedb) {
        var cmd = "UPDATE " + config.botName + "startup SET value = '" + Msg + "', setting = 'enterPM'";
        client.query(cmd, function (err, results, fields) {
            if (err) { botSpeak('console', err + " setEnterMsg"); }
        });
    };
};

//djq
var addToDjq = function (userid, username, isDj) {
    if (config.usedb) {
        if (userid !== config.userid) {
            if (!isDj) {
                client.query('SELECT userid FROM ' + config.botName + 'djq WHERE userid = ?', [userid], function (err, results) {
                    if (err) { botSpeak('console', err + " addToDjq"); }
                    if (results.length < 1) {
                        client.query('INSERT INTO ' + config.botName + 'djq SET userid = ?, username = ?', [userid, username], function (err, results) {
                            if (err) { botSpeak('console', err); }
                            qLength += 1;
                            botSpeak('chat', username + " added to the djq in spot " + qLength);
                        });
                    } else if (results.length > 0) {
                        botSpeak('chat', "Im sorry you're already on the djq @" + username);
                    }
                });
            } else {
                botSpeak('chat', "Im sorry you can't add yourself while you are on deck @" + username);
            }
        }
    }
};

var onDeckRemDjq = function (userid, username) {
    if (config.usedb && config.useDjq) {
        client.query('SELECT userid, username FROM ' + config.botName + 'djq', function (err, results) {
            if (err) { botSpeak('console', err + " onDeckRemDjq"); }
            var reUserid = results[0].userid;
            var reUsername = results[0].username;
            if (reUserid === userid) {
                client.query('DELETE FROM ' + config.botName + 'djq WHERE userid = ?', [userid], function (err, results) {
                    if (err) { botSpeak('console', err); }
                    qLength = qLength - 1;
                    getFirstonQ();
                });
            } else {
                botSpeak('chat', "@" + username + " you're not first on the q. @" + reUsername + " your spot on deck." );
            }
        });
    }
};

var userRemDjq = function (userid, username) {
    if (config.usedb) {
        client.query('DELETE FROM ' + config.botName + 'djq WHERE userid = ?', [userid], function (err, results) {
            if (err) { botSpeak('console', err + " userRemDjq"); }
            qLength = qLength - 1;
            returnDjq();
        });
    }
};

var ModRemDjq = function (username) {
    if (config.usedb) {
        username = '%' + username + '%';
        client.query("DELETE FROM " + config.botName + "djq WHERE username like ?", [username], function (err, results) {
            if (err) { botSpeak('console', err + " ModRemDjq"); }
            qLength = qLength - 1;
            returnDjq();
        });
    };
};

var ModClearDjq = function (username) {
    if (config.usedb) {
        client.query('DELETE FROM ' + config.botName + 'djq', function (err, results) {
            if (err) { botSpeak('console', err + " ModClearDjq"); }
            returnDjq();
            qLength = 0;
        });
    };
};

var returnDjq = function () {
    if (config.usedb) {
        var response = '';
        client.query('SELECT username FROM ' + config.botName + 'djq ORDER by id', function (err, results) {
            if (err) { botSpeak('console', err + " returnDjq"); }
            if (results.length > 0) {
                for (i = 0; i < results.length; i++) {
                    var name = results[i]['username'];
                    response = response + util.format(':small_blue_diamond:#%s %s ', i + 1, name);
                }
                botSpeak('chat', "The DJQ is as follows: " + response);
            } else {
                botSpeak('chat', "The DJQ is EMPTY, FREE FOR ALL ON THE DECK!");
            }
        });
    };
};

var getFirstonQ = function () {
    if (config.usedb) {
        var response = '';
        client.query('SELECT username FROM ' + config.botName + 'djq ORDER by id LIMIT 1', function (err, results) {
            if (err) { botSpeak('console', err + " getFirstonQ"); }
            if (results.length > 0) {
                for (i = 0; i < results.length; i++) {
                    var name = results[i]['username'];
                    response = response + util.format('%s', name);
                }
                botSpeak('chat', "Next in line is: @" + response);
            } else {
                botSpeak('chat', "The DJQ is EMPTAY, FREE FOR ALL ON THE DECK!");
            }
        });
    };
};

//alloweddjs
var clearAllowedDjs = function (username) {
    if (config.usedb) {
        client.query('DELETE FROM ' + config.botName + 'alloweddjs', function (err, results) {
            if (err) { botSpeak('console', err + " clearAllowedDjs"); }
            getAllowedDjs();
        });
    };
};

var remAllowedDj = function (username) {
    if (config.usedb) {
        client.query('DELETE FROM ' + config.botName + 'alloweddjs WHERE username = ?', [username], function (err, results) {
            if (err) { botSpeak('console', err + " remAllowedDj"); }
            getAllowedDjs();
        });
    };
};

var addAllowedDj = function (username) {
    if (config.usedb) {
        client.query('SELECT userid FROM ' + config.botName + 'users WHERE username = ?', [username], function (err, results) {
            if (err) { botSpeak('console', err + " addAllowedDj"); }
            var userid = results[0].userid;
            client.query('INSERT INTO ' + config.botName + 'alloweddjs SET userid = ?, username = ?', [userid, username], function (err, results2) {
                if (err) { botSpeak('console', err); }
                getAllowedDjs();
            });
        });
    };
};

var escortNotAllowedDj = function (userid) {
    if ((config.usedb) && (config.deckControl)) {
        client.query('SELECT count(userid) as count, username FROM ' + config.botName + 'alloweddjs WHERE userid = ?', [userid], function (err, results) {
            if (err) { botSpeak('console', err + " escortNotAllowedDj"); }
            if (results) {
                var count = results[0].count;
                var username = results[0].name;
                if (count < 1) {
                    bot.remDj(userid);
                }
            }
        });
    };
};

var getAllowedDjs = function () {
    if (config.usedb) {
        var response = 'Allowed DJs are: ';
        client.query('SELECT username FROM ' + config.botName + 'alloweddjs ORDER BY id ASC', function (err, results) {
            if (err) { botSpeak('console', err + " getAllowedDjs"); }
            for (i = 0; i < results.length; i++) {
                var name = results[i]['username'];
                response = response + util.format('#%s %s ', i + 1, name);
            }
            botSpeak('pm', response, config.botOwner);
        });
    };
};

var getUserName = function (userid) {
    var userObj = ttRoom.userList[userid];
    var str = userObj.name;
    return str;
};

var getUpTime = function () {
    var startTime = config.startTime;
    var cur = new Date() - startTime;
    var days = Math.floor(cur / 86400000);
    cur = cur % 86400000;
    var hours = Math.floor(cur / 3600000);
    cur = cur % 3600000;
    var minutes = Math.floor(cur / 60000);
    cur = cur % 60000;
    var response = 'uptime: ';
    if (days > 0) {
        response += days + 'd:';
    }
    var response = (response + hours + 'h:' + minutes + 'm:' + Math.floor(cur / 1000) + 's.');
    return response;
};

var Song = function () {
    this.songTitle = '';
    this.artist = '';
    this.djId = '';
    this.djName = '';
    this.votes = { 'up': 0, 'down': 0 };
    this.hearts = 0;
};

var currentSong = new Song();

var addCurrentSongToHistory = function (data) {
    if (data.room.metadata.current_song === null) {
        return;
    }

    // create a new 'play' object with the last played song
    // this is what we'll add to the history
    var play = new Song();
    play.songid = currentSong.songId
    play.songTitle = currentSong.songTitle;
    play.artist = currentSong.artist;
    play.length = currentSong.length;
    play.genre = currentSong.genre;
    play.djId = currentSong.djId;
    play.djName = currentSong.djName;
    play.votes.up = currentSong.votes['up'];
    play.votes.down = currentSong.votes['down'];
    play.hearts = currentSong.hearts;

    if ((config.usedb) && (config.addStats)) {
        addSongToDb(play);
    }

    // add the 'play' object to history
    if ((play.songid != 'undefined') && (play.songTitle != 'Untitled')) {
        ttRoom.history.unshift(play);
        if (ttRoom.history.length > 3) {
            ttRoom.history.pop();
        }
    }

    // reset the properties of the 'currentSong' object to what is currently playing
    currentSong.songId = data.room.metadata.current_song._id;
    currentSong.songTitle = data.room.metadata.current_song.metadata.song;
    currentSong.artist = data.room.metadata.current_song.metadata.artist;
    currentSong.length = getTrackTime(data.room.metadata.current_song.metadata.length);
    currentSong.genre = data.room.metadata.current_song.metadata.genre;
    currentSong.djId = data.room.metadata.current_song.djid;
    currentSong.djName = data.room.metadata.current_song.djname;
    currentSong.votes.up = data.room.metadata.upvotes;
    currentSong.votes.down = data.room.metadata.downvotes;
    currentSong.hearts = 0;
};

var getTrackTime = function (seconds) {
    var timeMs = new Date(seconds * 1000);
    var trackTime;
    trackTime = timeFormat(timeMs.getUTCMinutes()) + ":" + timeFormat(timeMs.getUTCSeconds());
    return trackTime;
};

var findOwner = function () {
    bot.stalk(config.botOwner, function (data) {
        bot.roomRegister(data.roomId);
    });
};

var homeRoom = function () {
    bot.roomRegister(config.roomid);
};

var timeFormat = function (num) {
    return (num < 10) ? "0" + num : num;
};

var getIdleTimes = function () {
    var str = '';
    var now = new Date();
    for (var dj in ttRoom.djList) {
        var djObj = ttRoom.djList[dj];
        var lastActivity = djObj.lastActivity;
        var diffMS = now - lastActivity;
        var diff = new Date(diffMS);
        var idleTime;
        if (diff.getUTCHours() > 0) {
            idleTime = timeFormat(diff.getUTCHours()) + ":" + timeFormat(diff.getUTCMinutes()) + ":" + timeFormat(diff.getUTCSeconds());
        } else {
            idleTime = timeFormat(diff.getUTCMinutes()) + ":" + timeFormat(diff.getUTCSeconds());
        }
        str = str + djObj.name + ': ' + idleTime + '; ';
    }
    return str;
};

var getAfkTimes = function (time) {
    var str = '';
    var now = new Date();
    for (var dj in ttRoom.djList) {
        var djObj = ttRoom.djList[dj];
        var lastActivity = djObj.lastActivity;
        var diffMS = now - lastActivity;
        var diff = new Date(diffMS);
        var idleTime;
        if (diffMS >= (time * 60000)) {
            if (diff.getUTCHours() > 0) {
                idleTime = timeFormat(diff.getUTCHours()) + ":" + timeFormat(diff.getUTCMinutes()) + ":" + timeFormat(diff.getUTCSeconds());
            } else {
                idleTime = timeFormat(diff.getUTCMinutes()) + ":" + timeFormat(diff.getUTCSeconds());
            }
            str = str + util.format('@%s: %s;', djObj.name, idleTime);
        }
    }
    if (str === '') {
        str = util.format('No DJs currently over %s minutes idle', time);
    }
    return str;
};

var getuserlist = function () {
    var str = 'The room AFK goes like this: ';
    var now = new Date();
    var loopcnt = 0;
    for (var user in ttRoom.userList) {
        var userObj = ttRoom.userList[user];
        var laptop = userObj.laptop;
        var lastActivity = userObj.lastActivity;
        var diffMS = now - lastActivity;
        var diff = new Date(diffMS);
        var idleTime;
        loopcnt = loopcnt + 1;
        if (diff.getUTCHours() > 0) {
            idleTime = timeFormat(diff.getUTCHours()) + ":" + timeFormat(diff.getUTCMinutes()) + ":" + timeFormat(diff.getUTCSeconds());
        } else {
            idleTime = timeFormat(diff.getUTCMinutes()) + ":" + timeFormat(diff.getUTCSeconds());
        }
        str = str + util.format('%s: %s;', userObj.name, idleTime);
    }
    return loopcnt + " users plus me: " + str;
};

var getusercount = function () {
    var loopcnt = 1;  //bot is not included in the userlist so start with one.
    for (var user in ttRoom.userList) {
        loopcnt = loopcnt + 1;
    }
    return loopcnt;
};

//AFK CHECKING
var afkCheck = function () {
    var str = '';
    var now = new Date();

    for (var dj in ttRoom.djList) {
        var djObj = ttRoom.djList[dj];
        var lastActivity = djObj.lastActivity;
        var diffMS = now - lastActivity;
        var diff = new Date(diffMS);
        var idleTime;

        if (config.afkCheck) {
            if ((diff.getUTCMinutes() === (config.afkMin - 5)) && (diff.getUTCSeconds() === 0) && (djObj.userid != config.userid)) {
                idleTime = timeFormat(diff.getUTCMinutes()) + ":" + timeFormat(diff.getUTCSeconds());
                str = util.format('%s', idleTime);
                botSpeak('chat', "Please keep active while on deck @" + djObj.name + " your AFK time is: " + str + " and I will escort at " + config.afkMin
                + " minutes.");
            }
            if ((diff.getUTCMinutes() === config.afkMin) && (diff.getUTCSeconds() === 0) && (djObj.userid != config.userid)) {
                idleTime = timeFormat(diff.getUTCMinutes()) + ":" + timeFormat(diff.getUTCSeconds());
                str = util.format('%s', idleTime);
                bot.remDj(djObj.userid);
                botSpeak('chat', "@" + djObj.name + " escorted for AFK time of " + str + ". Please keep active by voting or chatting.");
            }
        }
    }
};

setInterval(afkCheck, 1000) //This repeats the every 1 second

///TIMERS
var TimersCheck = function () {
    if (config.deckcheck) {
        var str = '';
        var now = new Date();
        for (var dj in ttRoom.djList) {
            var djObj = ttRoom.djList[dj];
            var startedSpinning = djObj.startedSpinning;
            var diffMS = now - startedSpinning;
            var diff = new Date(diffMS);
            var spinningTime;

            if (config.crowdCheck) {
                if ((diff.getUTCHours() === config.deckHours) && (diff.getUTCMinutes() === 0) && (diff.getUTCSeconds() === 0) && (djObj.userid != config.userid)) {
                    spinningTime = timeFormat(diff.getUTCHours()) + ":" + timeFormat(diff.getUTCMinutes()) + ":" + timeFormat(diff.getUTCSeconds());
                    str = util.format('%s', spinningTime);
                    botSpeak('chat', "Please step down after your next track @" + djObj.name + ", your deck time is at: " + str + ". Please wait one track before returning to deck to reset my timer.");
                }
                if ((diff.getUTCHours() === config.deckHours) && (diff.getUTCMinutes() === 30) && (diff.getUTCSeconds() === 0) && (djObj.userid != config.userid) && (djObj.userid != currentSong.djId)) {
                    spinningTime = timeFormat(diff.getUTCHours()) + ":" + timeFormat(diff.getUTCMinutes()) + ":" + timeFormat(diff.getUTCSeconds());
                    str = util.format('%s', spinningTime);
                    bot.remDj(djObj.userid);
                    botSpeak('chat', "@" + djObj.name + " escorted for dj time limit at: " + str + ". Please wait one track before returning to deck to reset my timer.");
                }
                if ((diff.getUTCHours() === config.deckHours) && (diff.getUTCMinutes() === 30) && (diff.getUTCSeconds() === 30) && (djObj.userid != config.userid) && (djObj.userid != currentSong.djId)) {
                    spinningTime = timeFormat(diff.getUTCHours()) + ":" + timeFormat(diff.getUTCMinutes()) + ":" + timeFormat(diff.getUTCSeconds());
                    str = util.format('%s', spinningTime);
                    bot.remDj(djObj.userid);
                    botSpeak('chat', "@" + djObj.name + " escorted for dj time limit at: " + str + ". Please wait one track before returning to deck to reset my timer.");
                }
                //GIVE WARNING AT 32 MINUTES THAT WILL BOOT FROM THE ROOM. this prevents autodj's from hopping up and down.
                if ((diff.getUTCHours() === config.deckHours) && (diff.getUTCMinutes() === 30) && (diff.getUTCSeconds() === 30) && (djObj.userid != config.userid) && (djObj.userid != currentSong.djId)) {
                    spinningTime = timeFormat(diff.getUTCHours()) + ":" + timeFormat(diff.getUTCMinutes()) + ":" + timeFormat(diff.getUTCSeconds());
                    str = util.format('%s', spinningTime);
                    bot.remDj(djObj.userid);
                    botSpeak('chat', "@" + djObj.name + " escorted for dj time limit at: " + str + " NEXT TIME I WILL BOOT YOU FROM THE ROOM!");
                }

                //at 31:30 in deck time, and 6 escorts from deck we will boot the user from the room.
                if ((diff.getUTCHours() === config.deckHours) && (diff.getUTCMinutes() === 31) && (diff.getUTCSeconds() === 0) && (djObj.userid != config.userid) && (djObj.userid != currentSong.djId)) {
                    spinningTime = timeFormat(diff.getUTCHours()) + ":" + timeFormat(diff.getUTCMinutes()) + ":" + timeFormat(diff.getUTCSeconds());
                    str = util.format('%s', spinningTime);
                    bot.bootUser(user.userid, "abusing the deck");
                    botSpeak('console', "abusing the deck" + user.name + " : " + user.userid);
                    addBotlogToDb(config.userid, "abusing the deck" + user.name + " : " + user.userid);
                }
            }
        }
    }
};

setInterval(TimersCheck, 1000) //This repeats the every 1 second

//CROWD AFK CHECKING
var afkCrowdCheck = function () {
    var str = '';
    var now = new Date();
    for (var user in ttRoom.userList) {
        var userObj = ttRoom.userList[user];
        var lastActivity = userObj.lastActivity;
        var diffMS = now - lastActivity;
        var diff = new Date(diffMS);
        var inactiveTime;

        if (config.crowdCheck) {
            if ((diff.getUTCHours() >= config.inactiveLimit) && (userObj.userid != config.userid) && (userObj.userid != config.battlebot)) {
                inactiveTime = timeFormat(diff.getUTCHours()) + ":" + timeFormat(diff.getUTCMinutes()) + ":" + timeFormat(diff.getUTCSeconds());
                str = util.format('%s', inactiveTime);
                bot.bootUser(userObj.userid, 'crowd control for afk over ' + config.inactiveLimit + " hours.");
                addBotlogToDb(config.userid, "afk crowd limit up for @" + userObj.name + " " + userObj.userid + ": " + str);
            }
        }
    }
};

setInterval(afkCrowdCheck, 1000) //This repeats the every 1 second

var getDjTimes = function () {
    var str = '';
    var now = new Date();
    for (var dj in ttRoom.djList) {
        var djObj = ttRoom.djList[dj];
        var startedSpinning = djObj.startedSpinning;
        var diffMS = now - startedSpinning;
        var diff = new Date(diffMS);
        var spinningTime;

        if (diff.getUTCHours() > 0) {
            spinningTime = timeFormat(diff.getUTCHours()) + ":" + timeFormat(diff.getUTCMinutes()) + ":" + timeFormat(diff.getUTCSeconds());
        } else {
            spinningTime = timeFormat(diff.getUTCMinutes()) + ":" + timeFormat(diff.getUTCSeconds());
        }
        str = str + djObj.name + ': ' + spinningTime + '; ';
    }
    return str;
};

var getLastSongs = function () {
    var string = '';
    var limit = 3;
    if (config.usedb) {
        var cmd = "SELECT username, songTitle, artist, length, awesomes, lames, snags FROM " + config.botName + "songs ORDER BY `timestamp` DESC LIMIT " + limit;
        client.query(cmd, function (err, results, fields) {
            if (err) {
                botSpeak('console', err + " getLastSongs");
            }
            if (results) {
                for (var i = 0; i < limit; i++) {
                    var name = results[i]['username'];
                    var songTitle = results[i]['songTitle'];
                    var artist = results[i]['artist'];
                    var length = results[i]['length'];
                    var awesomes = results[i]['awesomes'];
                    var lames = results[i]['lames'];
                    var snags = results[i]['snags'];
                    string = string + util.format('#%s %s played "%s" by %s %s, %d⇑ %d⇓ %d♥s.', i + 1, name, songTitle, artist, length, awesomes, lames, snags);
                }
                botSpeak('chat', string);
            }
        });
    } else {
        for (var i = 0; i < num; i++) {
            if (ttRoom.history[i] === undefined) {
                string = string + 'I don\'t have history for the ' + getGetOrdinal(i + 1) + ' song, sorry. ';
                continue;
            }
            string = string + util.format('♫ %s played "%s" by %s length %s, %d⇑ %d⇓ %d♥s. ', ttRoom.history[i].djName, ttRoom.history[i].songTitle, ttRoom.history[i].artist, ttRoom.history[i].length, ttRoom.history[i].votes.up, ttRoom.history[i].votes.down, ttRoom.history[i].hearts);
        }
        botSpeak('chat', string);
    }
};

var getGetOrdinal = function (n) {
    var s = ["th", "st", "nd", "rd"],
       v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

var dateToString = function (date) {
    //check that date is a date object 
    if (date && date.getFullYear()) {
        return date.getFullYear() + '-' + (date.getMonth() + 1) + '-' +
        date.getDate() + ' ' + date.getHours() + '-' + date.getMinutes() + '-' +
        date.getSeconds();
    }
    return "";
}

var addUserToDJList = function (user) {
    // if there is 5 or more ppl on djlist, something went wrong
    // let's remove the first one
    if (Object.keys(ttRoom.djList).length >= 5) {
        delete ttRoom.djList[Object.keys(ttRoom.djList)[0]];
    }
    user.lastActivity = new Date();
    user.startedSpinning = new Date();
    user.plays = 0;
    ttRoom.djList[user.userid] = user;
    if (qLength > 0) {
        onDeckRemDjq(user.userid, user.name);
    }
};

var addToPlayCount = function (userid) {
    if (ttRoom.djList[userid] !== undefined) {
        var user = ttRoom.djList[userid];
        user.plays = user.plays + 1;
        ttRoom.djList[user.userid] = user;
    }
};

var getPlayCount = function () {
    str = '';
    for (var dj in ttRoom.djList) {
        var dj = ttRoom.djList[dj];
        var name = dj.name;
        var plays = dj.plays;
        str = str + util.format(' %s has %d play(s)', name, plays);
    }
    return str;
}

// where to speak, what to speak, who to speak to (pm only)
var botSpeak = function (where, what, who) {
    switch (where) {
        case 'chat':
            bot.speak(what);
            break;
        case 'pm':
            bot.pm(what, who);
            break;
        case 'console':
            console.log(what);
            break;
    }
};

var selfCommand = function (command, param) {
    var who = {
        isOwner: true,
        isJBIRD: true,
        isMod: true,
        isDj: null
    };
    var commandObj = {
        'command': command,
        'param': param,
        'who': who
    };
    doCommand(commandObj);
};

//dbfunctions
var discoverNewUser = function (user) {
    if (config.usedb) {
        var userid = user.userid;
        var username = user.name;
        var response = '';
        var cmd = "SELECT userid FROM " + config.botName + "users WHERE userid = '" + userid + "'";
        client.query(cmd, function (err, results) {
            if (err) {
                botSpeak('console', err + " discoverNewUser");
            }
            if (!username.match(/ttstats/i)) {
                if ((results) && (results.length === 0)) {
                    greetNewUser(userid, username);
                }
            }
        });
    }
}

function greetNewUser(userid, username) {
    response = util.format("Welcome to " + config.roomName + " @%s. I don't believe we've met. " + config.roomTheme + " please, " + config.songLimit
            + " minute song limit at this time, 15min AFK rule, " + config.deckHours
            + " hr DJ limit. Go ahead and get yourself on the DJ queue with a jq+ in chat", username);
    botSpeak('pm', response, userid);
}

var updateUsers = function (user) {
    if (config.usedb) {
        var cmd = "SELECT userid FROM " + config.botName + "users WHERE (userid = '" + user.userid + "')";
        client.query(cmd, function select(err, results) {
            if (err) {
                botSpeak('console', err + " updateUsers");
            }
            if ((results) && (results.length > 0)) {
                client.query('UPDATE ' + config.botName + 'users SET username = ?, created = ?, laptop = ?, acl = ?, fans = ?, points = ?, avatarid = ? WHERE (userid = ?)',
                    [user.name, user.created, user.laptop, user.acl, user.fans, user.points, user.avatarid, user.userid],
                    function (err, results) {
                        if (err) {
                            botSpeak('console', err + " updateUsers");
                        }
                    });
            } else {
                client.query('INSERT INTO ' + config.botName + 'users SET userid = ?, username = ?, created = ?, laptop = ?, acl = ?, fans = ?, points = ?, avatarid = ?',
                    [user.userid, user.name, user.created, user.laptop, user.acl, user.fans, user.points, user.avatarid]);
            }
        });
    }
};

var addSongToDb = function (play) {
    //    var play = play.songid, play.songTitle, play.artist, play.length, play.genre, play.djId, play.djName, play.votes.up, play.votes.down, play.hearts
    if (config.usedb) {
        if (play.songTitle != '') {
            client.query('INSERT INTO ' + config.botName + 'songs SET songid = ?, songTitle = ?, artist = ?, length = ?, genre = ?, userid = ?, username = ?, awesomes = ?, lames = ?, snags = ?', [play.songid, play.songTitle, play.artist, play.length, play.genre, play.djId, play.djName, play.votes.up, play.votes.down, play.hearts]);
        }
    }
}

var addChatToDb = function (userid, username, text) {
    //    chat = name, laptop_version, laptop, created, acl, fans, points, _id, avatarid
    if (config.usedb) {
        client.query('INSERT INTO ' + config.botName + 'chat SET userid = ?, username = ?, text = ?', [userid, username, text]);
    }
}

var addBotlogToDb = function (userid, text) {
    //    chat = name, laptop_version, laptop, created, acl, fans, points, _id, avatarid
    if (config.usedb) {
        client.query('INSERT INTO ' + config.botName + 'botlog SET userid = ?, text = ?', [userid, text]);
    }
}

var getFtp = function () {
    if (config.usedb) {
        var cmd = "SELECT value FROM " + config.botName + "startup WHERE (setting = 'JBIRDftp')";
        client.query(cmd, function (err, results) {
            if (err) { botSpeak('console', err + " getFtp"); }
            if (results) {
                var response = results[0].value;
                botSpeak('chat', response);
            }
        });
    }
}

var getMyStats = function (userid, name) {
    if (config.usedb) {
        var cmd = "SELECT " + config.botName + "users.username, round((SUM(awesomes)/COUNT(songid)),2) AS avg, COUNT(" + config.botName + "songs.songid) AS songs, "
        + "SUM(" + config.botName + "songs.awesomes) AS awesomes, SUM(" + config.botName + "songs.lames) AS lames, SUM(" + config.botName + "songs.snags) AS snags, ROUND(SUM(length) / 60, 2) AS hours, "
        + "" + config.botName + "songs.userid FROM " + config.botName + "songs INNER JOIN " + config.botName + "users ON " + config.botName + "songs.userid = " + config.botName + "users.userid "
        + "WHERE (" + config.botName + "songs.userid <> '" + config.userid + "') "
        + "GROUP BY " + config.botName + "songs.userid ORDER BY awesomes DESC";
        client.query(cmd, function (err, results, fields) {
            if (err) {
                botSpeak('console', err + " getMyStats");
            }
            if (results.length > 0) {
                for (i = 0; i < results.length; i++) {
                    if (userid === results[i].userid) {
                        var name = results[i]['username'];
                        var songs = results[i]['songs'];
                        var playhours = results[i]['hours'];
                        var awesomes = results[i]['awesomes'];
                        var lames = results[i]['lames'];
                        var snags = results[i]['snags'];
                        var avg = results[i]['avg'];
                        response = util.format('%s you are ranked #%s with %d♫, %d playhours, votes: %d⇑ %d⇓ %d♥s, averaging %s awesomes/play (ranked by awesomes since 10/11/12)', name, i + 1, songs, playhours, awesomes, lames, snags, avg);
                        botSpeak('chat', response);
                    }
                }
            } else {
                botSpeak('chat', "Sorry no results.");
            }
        });
    }
}

var getNewStats = function (userid) {
    if (config.usedb) {
        var response = getUserName(userid) + " play history: ";
        var dateplay = '';
        var songs = '';
        var awesomes = '';
        var lames = '';
        var snags = '';
        var average = null;
        var limit = 3;
        var cmd = "SELECT Date(`timestamp`)as dateplay, COUNT(songid) AS songs, SUM(awesomes) AS awesomes, SUM(lames) AS lames, SUM(snags) AS snags "
    + "FROM " + config.botName + "songs GROUP BY userid, Date(`timestamp`) HAVING (userid = '" + userid + "') ORDER BY dateplay DESC LIMIT " + limit;
        client.query(cmd, function (err, results, fields) {
            if (err) {
                botSpeak('console', err + " getNewStats");
            }
            if (results.length > 0) {
                var length = null;
                if (results.length < limit) {
                    length = results.length;
                } else {
                    length = limit;
                }
                for (i = 0; i < length; i++) {
                    songs = results[i]['songs'];
                    awesomes = results[i]['awesomes'];
                    lames = results[i]['lames'];
                    snags = results[i]['snags'];
                    average = (awesomes / songs).toFixed(2);
                    response = response + util.format('play(s)=%s, %d⇑ %d⇓ %d♥s averaging %s⇑/play. ', songs, awesomes, lames, snags, average);
                }
                botSpeak('chat', response);
            } else {
                botSpeak('chat', "Sorry no results.");
            }
        });
    }
}

var getTodayStats = function (userid) {
    if (config.usedb) {
        var cmd = "SELECT Date(" + config.botName + "songs.`timestamp`) as dateplay, COUNT(" + config.botName + "songs.songid) as songs, " + config.botName + "songs.userid, " + config.botName + "users.username, "
    + "SUM(" + config.botName + "songs.awesomes) as awesomes, SUM(" + config.botName + "songs.lames) as lames, SUM(" + config.botName + "songs.snags) as snags, ROUND(SUM(" + config.botName + "songs.length) / 60, 2) AS hours FROM " + config.botName + "songs "
    + "INNER JOIN " + config.botName + "users ON " + config.botName + "songs.userid = " + config.botName + "users.userid WHERE (" + config.botName + "songs.userid = '" + userid + "') "
    + "AND (Date(" + config.botName + "songs.`timestamp`) = date(sysdate())) GROUP BY Date(" + config.botName + "songs.`timestamp`), userid ORDER BY Date(" + config.botName + "songs.`timestamp`) desc";
        client.query(cmd, function (err, results, fields) {
            if (err) {
                botSpeak('console', err + " getTodayStats");
            }
            if (results.length > 0) {
                var username = results[0]['username'];
                var songs = results[0]['songs'];
                var hours = results[0]['hours'];
                var awesomes = results[0]['awesomes'];
                var lames = results[0]['lames'];
                var snags = results[0]['snags'];
                var average = (awesomes / songs).toFixed(2);
                var response = util.format('%s play history: %s play(s), %s playhours, %d⇑ %d⇓ %d♥s averaging %s⇑/play. ', username, songs, hours, awesomes, lames, snags, average);
                botSpeak('chat', response);
            } else {
                botSpeak('chat', "Sorry no results. You have not played yet today.");
            }
        });
    }
}

var getTrackStats = function (songTitle) {
    if (config.usedb) {
        if (songTitle != 'Untitled') {
            client.query('SELECT COUNT(songTitle) AS plays, SUM(awesomes) AS awesomes, SUM(lames) AS lames, SUM(snags) AS snags FROM ' + config.botName + 'songs '
            + 'WHERE songTitle = ? AND userid <> ?', [songTitle, config.userid],
                    function select(err, results) {
                        if (err) {
                            botSpeak('console', err + " getTrackStats");
                        }
                        if (results[0]['plays'] > 0) {
                            var plays = results[0]['plays'];
                            var awesomes = results[0]['awesomes'];
                            var lames = results[0]['lames'];
                            var snags = results[0]['snags'];
                            var average = (awesomes / plays).toFixed(2);
                            response = util.format('%s has %s play(s), %d⇑ %d⇓ %d♥s averaging %s⇑/play (since ' + config.openDate + ', not counting ' + config.botName + ' plays).', currentSong.songTitle, plays, awesomes, lames, snags, average);
                            botSpeak('chat', response);
                            if (config.newMode) {
                                newCount = 0;
                            }
                        } else {
                            var response = '';
                            botSpeak('chat', currentSong.songTitle + " by " + currentSong.artist + " is a new track that I've not yet heard(since " + config.openDate + ", not counting " + config.botName + " plays).");
                            if (config.newMode) {
                                bot.vote('up');
                                newCount += 1;
                                if (newCount === 1) {
                                    botSpeak('chat', "Let's see how many new tracks in a row we can get! We're at 1 to start.");
                                } else if ((newCount > 1) && (newCount < 6)) {
                                    botSpeak('chat', newCount + " IN A ROW!");
                                } else if ((newCount > 5) && (newCount < 10)) {
                                    botSpeak('chat', "new track count of: " + newCount + " We're coming up on 10!");
                                } else if (newCount > 10) {
                                    botSpeak('chat', "WE'RE OVER TEN IN A ROW AT " + newCount + "!");
                                } else if (newCount > 15) {
                                    botSpeak('chat', "WHOLY MOOSE WE'RE AT " + newCount + "!");
                                } else if (newCount > 20) {
                                    botSpeak('chat', "Would we ever hit 20 I've wondered... " + newCount + "!");
                                }
                            }
                        }
                    });
        } else {
            botSpeak('chat', "Sorry I don't count Untitled.");
        }
    }
}

var getTopDjs = function () {
    if (config.usedb) {
        var limit = 10;
        var response = '';
        var cmd = "SELECT " + config.botName + "users.username, COUNT(" + config.botName + "songs.songid) AS songs, SUM(" + config.botName + "songs.awesomes) AS awesomes, SUM(" + config.botName + "songs.lames) AS lames, "
        + "SUM(" + config.botName + "songs.snags) AS snags, " + config.botName + "songs.userid FROM " + config.botName + "songs INNER JOIN " + config.botName + "users ON " + config.botName + "songs.userid = " + config.botName + "users.userid WHERE (" + config.botName + "songs.userid "
        + "<> '" + config.userid + "') GROUP BY " + config.botName + "songs.userid ORDER BY awesomes DESC LIMIT " + limit;
        client.query(cmd, function (err, results, fields) {
            if (err) {
                botSpeak('console', err + " getTopDjs");
            }
            if (results.length > 0) {
                for (i = 0; i < limit; i++) {
                    var name = results[i]['username'];
                    var songs = results[i]['songs'];
                    var awesomes = results[i]['awesomes'];
                    var lames = results[i]['lames'];
                    var snags = results[i]['snags'];
                    response = response + util.format('#%s %s %s♫ %d⇑ %d⇓ %d♥s. ', i + 1, name, songs, awesomes, lames, snags);
                }
                botSpeak('chat', response + 'in ' + config.roomName + '(since ' + config.openDate + ', not counting ' + config.botName + ' plays) sorted by awesomes');
            } else {
                botSpeak('chat', "Sorry no results.");
            }
        });
    }
}

var getTopSnags = function () {
    if (config.usedb) {
        var limit = 3;
        var response = '';
        var cmd = "SELECT COUNT(songTitle) AS plays, songTitle, artist, SUM(awesomes) AS awesomes, SUM(lames) AS lames, SUM(snags) AS snags "
        + "FROM " + config.botName + "songs GROUP BY songTitle HAVING (songTitle <> 'Untitled') ORDER BY snags DESC limit " + limit;
        client.query(cmd, function (err, results, fields) {
            if (err) {
                botSpeak('console', err + " getTopSnags");
            }
            if (results.length > 0) {
                for (i = 0; i < limit; i++) {
                    var songTitle = results[i]['songTitle'];
                    var artist = results[i]['artist'];
                    var awesomes = results[i]['awesomes'];
                    var lames = results[i]['lames'];
                    var snags = results[i]['snags'];
                    response = response + util.format('#%s %s by %s %d⇑ %d⇓ %d♥s. ', i + 1, songTitle, artist, awesomes, lames, snags);
                }
                botSpeak('chat', response + 'in ' + config.roomName + '(since ' + config.openDate + ', not counting ' + config.botName + ' plays).');
            } else {
                botSpeak('chat', "Sorry no results.");
            }
        });
    }
}

var getMostPlays = function () {
    if (config.usedb) {
        var response = '';
        var limit = 5;
        var cmd = "SELECT userid, username, COUNT(songid) AS songs, SUM(awesomes) AS awesomes, SUM(lames) AS lames, SUM(snags) AS snags, userid "
    + "FROM " + config.botName + "songs GROUP BY userid ORDER BY songs DESC, awesomes DESC LIMIT " + limit;
        client.query(cmd, function (err, results, fields) {
            if (err) {
                botSpeak('console', err + " getMostPlays");
            }
            if (results.length > 0) {
                for (i = 0; i < limit; i++) {
                    var userid = results[i]['userid'];
                    var name = results[i]['username'];
                    var songs = results[i]['songs'];
                    var awesomes = results[i]['awesomes'];
                    var lames = results[i]['lames'];
                    var snags = results[i]['snags'];
                    var avg = (awesomes / songs).toFixed(2);
                    response = response + util.format('#%s %s %s♫ %d⇑ %d⇓ %d♥s %s/play ', i + 1, name, songs, awesomes, lames, snags, avg);
                }
                botSpeak('chat', response + 'in ' + config.roomName + '(since ' + config.openDate + ', not counting ' + config.botName + ' plays).');
            } else {
                botSpeak('chat', "Sorry no results.");
            }
        });
    }
}

var getMyFavs = function (userid) {
    if (config.usedb) {
        var limit = 3;
        var response = '';
        var cmd = "SELECT COUNT(songid) AS plays, songTitle, SUM(awesomes) AS awesomes, SUM(lames) AS lames, SUM(snags) AS snags FROM " + config.botName + "songs "
    + "WHERE (userid = '" + userid + "') GROUP BY songid ORDER BY plays DESC, awesomes DESC limit " + limit;
        client.query(cmd, function (err, results, fields) {
            if (err) {
                botSpeak('console', err + " getMyFavs");
            }
            if (results.length > 0) {
                var length = null;
                if (results.length < limit) {
                    length = results.length;
                } else {
                    length = limit;
                }
                for (i = 0; i < length; i++) {
                    var name = getUserName(userid);
                    var plays = results[i]['plays'];
                    var songTitle = results[i]['songTitle'];
                    var awesomes = results[i]['awesomes'];
                    var lames = results[i]['lames'];
                    var snags = results[i]['snags'];
                    response = response + util.format('#%s %s has played %s times: %d⇑ %d⇓ %d♥s. ', i + 1, songTitle, plays, awesomes, lames, snags);
                }
                botSpeak('chat', response + 'in ' + config.roomName + '(since ' + config.openDate + ', not counting ' + config.botName + ' plays)., sorted by play(s)/awesomes)');
            } else {
                botSpeak('chat', "Sorry no results.");
            }
        });
    }
}

var getFunny = function () {
    if (config.usedb) {
        var cmdget = "SELECT text FROM " + config.botName + "funnyme ORDER BY rand() LIMIT 1";
        client.query(cmdget, function (err, results, fields) {
            if (err) {
                botSpeak('console', err + " getFunny");
            }
            if (results) {
                var text = results[0]['text'];
                botSpeak('chat', text);
            }
        });
    }
}

var getMeowMe = function () {
    if (config.usedb) {
        var cmdget = "SELECT text FROM " + config.botName + "meowlist ORDER BY rand() LIMIT 1";
        client.query(cmdget, function (err, results, fields) {
            if (err) {
                botSpeak('console', err + " getMeowMe");
            }
            if (results) {
                var text = results[0]['text'];
                botSpeak('chat', text);
            }
        });
    }
}

var getTeachme = function () {
    if (config.usedb) {
        var cmdget = "SELECT text FROM " + config.botName + "teachme ORDER BY rand() LIMIT 1";
        client.query(cmdget, function (err, results, fields) {
            if (err) {
                botSpeak('console', err + " getTeachme");
            }
            if (results) {
                var text = results[0]['text'];
                botSpeak('chat', text);
            }
        });
    }
}

var getTopTracks = function () {
    if (config.usedb) {
        var limit = 5;
        var response = '';
        var cmd = "SELECT COUNT(songTitle) AS plays, songTitle, SUM(awesomes) AS awesomes, SUM(lames) AS lames, SUM(snags) AS snags "
    + "FROM " + config.botName + "songs WHERE (userid <> '" + config.userid + "') AND (songTitle <> 'Untitled') "
    + "GROUP BY songTitle ORDER BY awesomes DESC LIMIT " + limit;
        client.query(cmd, function (err, results, fields) {
            if (err) {
                botSpeak('console', err + " getTopTracks");
            }
            if (results.length > 0) {
                for (i = 0; i < limit; i++) {
                    var plays = results[i]['plays'];
                    var song = results[i]['songTitle'];
                    var awesomes = results[i]['awesomes'];
                    var lames = results[i]['lames'];
                    var snags = results[i]['snags'];
                    response = response + util.format('#%s %s has played %s times, %d⇑ %d⇓ %d♥s. ', i + 1, song, plays, awesomes, lames, snags);
                }
                botSpeak('chat', response + ' (since ' + config.openDate + ', not counting ' + config.botName + ' plays).');
            } else {
                botSpeak('chat', "Sorry no results.");
            }
        });
    }
}

function getTodaysTop() {
    if (config.usedb) {
        var limit = 5;
        var response = '';
        var cmd = "SELECT date(" + config.botName + "songs.`timestamp`) as date, count(" + config.botName + "songs.songid) as plays, " + config.botName + "songs.userid, " + config.botName + "users.username, sum(" + config.botName + "songs.awesomes) as awesomes, "
    + "sum(" + config.botName + "songs.lames) as lames, sum(" + config.botName + "songs.snags) as snags, round(sum(awesomes)/count(songid),2) AS avg, ROUND(SUM(" + config.botName + "songs.length) / 60, 2) AS hours "
    + "FROM " + config.botName + "songs INNER JOIN " + config.botName + "users ON " + config.botName + "songs.userid = " + config.botName + "users.userid GROUP BY date(" + config.botName + "songs.`timestamp`), " + config.botName + "users.username "
    + "HAVING (COUNT(songid) > 9) AND (" + config.botName + "songs.userid <>'" + config.userid + "') AND (date = date(sysdate())) "
    + "ORDER BY date(" + config.botName + "songs.`timestamp`) DESC, avg desc LIMIT " + limit;

        client.query(cmd, function (err, results, fields) {
            if (err) {
                botSpeak('console', err + " getTodaysTop");
            }
            if (results.length > 0) {
                for (i = 0; i < results.length; i++) {
                    username = results[i]['username'];
                    plays = results[i]['plays'];
                    hours = results[i]['hours'];
                    awesomes = results[i]['awesomes'];
                    lames = results[i]['lames'];
                    snags = results[i]['snags'];
                    avg = results[i]['avg'];
                    response = response + util.format('#%s %s has played %s tracks, %s playhours, %d⇑ %d/play. ', i + 1, username, plays, hours, awesomes, avg);
                }
                botSpeak('chat', response + " (sorted by avg/at least 10 play(s))");
            } else {
                botSpeak('chat', "Sorry nobody has logged more than ten plays yet.");
            }
        });
    }
}

//var doCommand = function(command, param, who, data) {
var doCommand = function (commandObj) {
    //    botSpeak('console', commandObj);
    // who's talking to us? 
    var who = commandObj.who;
    var spkr = {
        isOwner: false,
        isJBIRD: false,
        isSelf: false,
        isMod: false,
        isDj: false
    };
    extend(spkr, who);

    var levelOne = (spkr.isDj || spkr.isMod || spkr.isOwner || spkr.isJBIRD || spkr.isSelf) ? true : false;
    var levelTwo = (spkr.isMod || spkr.isOwner || spkr.isJBIRD || spkr.isSelf) ? true : false;
    var levelThree = (spkr.isOwner || spkr.isJBIRD) ? true : false;

    var param = commandObj.param;
    // set param to true/false based on string passed in
    if (param === "true") {
        param = true;
    } else if (param === "false") {
        param = false;
    }

    // where should the bot respond? console, chat, pm?
    var where = commandObj.where || 'chat';

    //'command': command,
    //'param': param,
    //'paramOrig': paramOrig,
    //'who': who,
    //'data': data,
    //'where': 'pm',
    //'pmID': data.senderid

    switch (commandObj.command) {
        //ANYONE COMMANDS                                                                                                                                                                                                                                                                                                                                          
        case 'commands':
            botSpeak(where, "My current commands are: ***ANYONE: jq+, jq-, jq, jdjs, jdance, jlast, jcurrent, jrules, jtagshelp, jemoji, "
            + "jtimers, jtiny, jfb, jfliptable, jfixtable, jfunnyme, jwhoo, jteachme, jbabybird, "
            + "jboobies, jmeowme, jgoogle, jzombies, jermagherd, jtools, jstagedive, jcustoms, jstats ", commandObj.pmID);
            if (spkr.isMod || spkr.isOwner || spkr.isJBIRD) {
                botSpeak('pm', "***MOD clearq, rem X, uptime, userlist, status, setnewtrack(true/false), crowdcheck(true/false), setcrowdcheck, "
                + "crowdcheckstat, pgreets(true/false), newgreets(true/false), pgreetsstat, afkcheck(true/false), jsetafk X, afkcheckstat, setgames(true/false), "
                + "autobop(true/false), autobopstat, setdeckcheck(true/false), setdecklimit X, decklimitstat, setlimit X, songlimitstat, current, lame, dj, theme X, "
                + "djhelp, hold, down, skip, autobot(true/false), avatar #, speak X, pmmods X, usetime(true/false), useplays(true/false), setplays X ", commandObj.pmID);
            }
            if (spkr.isOwner || spkr.isJBIRD) {
                botSpeak('pm', "***OWNER setenter(T/F), setentersay, enterstat, findme, ftp, setdeckcontrol(T/F), addallowed X, "
                + "remallowed X, clearallowed ", commandObj.pmID);
            }
            break;
        case 'stats':
            botSpeak(where, "***STATS jmystats, jtodaystats, jnewstats, jmyfavs, jtopdjs, jtodaystop, jtopsnags, jmostplays, jthistrack, jtoptracks", commandObj.pmID);
            break;
        case 'tools':
            botSpeak(where, "Using Google Chrome? Here are lots of places to keep up on for new things on turntable "
            + "TT+: http://turntableplus.fm/beta TTcustoms: http://turntablecustoms.com/ Auto: http://bit.ly/Azww5S", commandObj.pmID);
            break;
        case 'customs':
            botSpeak('chat', "Using Google Chrome? Turntable Customs extension for custom avatars, laptops, and hearts: http://bit.ly/SdayKb", commandObj.pmID);
            break;
        case 'djq':
            botSpeak('chat', "DJQ commands are jq+, jq-, jq", commandObj.pmID);
            break;
        case 'tiny':
            botSpeak('chat', config.roomName + " tinychat link: " + config.tinyLink, commandObj.pmID);
            break;
        case 'fb':
            botSpeak('chat', "Join the " + config.roomName + " FB group to receive invites to our events and parties: " + config.fbLink, commandObj.pmID);
            break;
        case 'rules':
            if (config.deckcheck) {
                botSpeak('chat', "Theme is: " + config.roomTheme + ", " + config.songLimit + " minute song limit at this time, 15min AFK rule, "
            + config.deckHours + " hr DJ limit. Full rules at: http://bit.ly/RRwHvI");
            } else if (config.songCheck) {
                botSpeak('chat', "Theme is: " + config.roomTheme + ", " + +config.songLimit + " minute song limit at this time, 15min AFK rule, "
            + config.deckPlays + " track play limit. Full rules at: http://bit.ly/RRwHvI");
            }
            break;
        case 'tagshelp':
            botSpeak('chat', "Editing metadata on Mac: http://bit.ly/syVKO "
            + "Editing metadata on PC: right click file, Properties/Details or http://www.mediamonkey.com/   "
            + "***Contributing artists and title are the fields TT reads.");
            break;
        case 'dance':
            if (config.danceMode) bot.vote('up');
            break;
        case 'smoke':
            if (config.danceMode) {
                bot.vote('up');
                botSpeak('chat', ":herb:SMOKE IT IF YOU GOT IT!:herb:", commandObj.pmID);
            }
            break;
        case 'emoji':
            botSpeak('chat', "http://www.emoji-cheat-sheet.com/");
            break;
        case 'ermagherd':
            botSpeak('chat', "http://bit.ly/MZYLHy");
            break;
        case 'whoo':
            botSpeak('chat', "WoWOOOOOOO!");
            break;
        case 'last':
            getLastSongs();
            break;
        case 'timers':
            if (config.deckcheck) {
                botSpeak(where, getDjTimes(), commandObj.pmID);
            } else {
                botSpeak(where, "I'm sorry we're using play counters at this time.", commandObj.pmID);
            }
            break;
        case 'current':
            var userCount = getusercount() - 1;
            var percent = Math.round(((currentSong.votes.up / userCount) * 100), 0);
            var string = util.format('%s is playing "%s" by %s length %s. Votes: %d⇑ %d⇓ %d♥s',
            currentSong.djName, currentSong.songTitle, currentSong.artist, currentSong.length, currentSong.votes.up, currentSong.votes.down,
            +currentSong.hearts);
            botSpeak(where, string, commandObj.pmID);
            break;
        case 'funnyme':
            if (config.games) {
                getFunny();
            }
            break;
        case 'teachme':
            if (config.games) {
                getTeachme();
            }
            break;
        case 'babybird':
            if (config.games) {
                botSpeak('chat', '(~￣▽￣)~');
            }
            break;
        case 'zombies':
            if (config.games) {
                botSpeak('chat', '٩(๏๏)۶٩(××)۶٩(●•)۶');
            }
            break;
        case 'fliptable':
            if (config.games) {
                botSpeak('chat', '(ノಠ益ಠ)ノ彡┻━┻');
            }
            break;
        case 'fixtable':
            if (config.games) {
                botSpeak('chat', '┬─┬ノ( º _ ºノ)');
            }
            break;
        case 'boobies':
            if (config.games) {
                botSpeak('chat', "( • Y • )");
            }
            break;
        case 'meowme':
            if (config.usedb) {
                getMeowMe();
            }
            break;
        case 'google':
            var searchQuery = currentSong.artist + " " + currentSong.songTitle;
            //replace the most common special characters and turn spaces into +
            searchQuery = searchQuery.replace(/\'/g, "%27").replace(/;/g, "%3B").replace(/#/g, "%23").replace(/@/g, "%40").replace(/&/g, "%26").replace(/</g, "%3C").replace(/>/g, "%3E").replace(/=/g, "%3D").replace(/\+/g, "%2B");
            //replace spaces with +
            searchQuery = searchQuery.split(' ').join('+');
            botSpeak(where, currentSong.artist + " " + currentSong.songTitle + ": https://www.google.com/search?q=" + searchQuery, commandObj.pmID);
            break;
        case 'stagedive':
            if (commandObj.data.userid === currentSong.djId) {
                escortId = commandObj.data.userid;
                botSpeak('chat', "Escort after this track set. ");
            } else {
                botSpeak('chat', "I'm sorry that feature is only available for the current DJ");
            }
            break;

        //STATS                                                                                                                                                                                           
        case 'mystats':
            if (config.usedb) {
                getMyStats(commandObj.data.userid, commandObj.data.name);
            }
            break;
        case 'newstats':
            if (config.usedb) {
                getNewStats(commandObj.data.userid);
            }
            break;
        case 'todaystats':
            if (config.usedb) {
                getTodayStats(commandObj.data.userid);
            }
            break;
        case 'topdjs':
            if (config.usedb) {
                getTopDjs();
            }
            break;
        case 'todaystop':
            if (config.usedb) {
                getTodaysTop();
            }
            break;
        case 'topsnags':
            if (config.usedb) {
                getTopSnags();
            }
            break;
        case 'thistrack':
            if (config.usedb) {
                getTrackStats(currentSong.songTitle);
            }
            break;
        case 'mostplays':
            if (config.usedb) {
                getMostPlays();
            }
            break;
        case 'myfavs':
            if (config.usedb) {
                getMyFavs(commandObj.data.userid);
            }
            break;
        case 'toptracks':
            if (config.usedb) {
                getTopTracks();
            }
            break;

        //playcount                                                   
        case 'djs':
            if (config.songCheck) {
                botSpeak(where, getPlayCount(), commandObj.pmID);
            } else {
                botSpeak(where, "I'm sorry we're using deck timers right now", commandObj.pmID);
            }
            break;

        //DJQ COMMANDS                                                                                                                                                 
        case 'q+':
            if ((config.usedb) && (config.useDjq)) {
                addToDjq(commandObj.data.userid, commandObj.data.name, spkr.isDj);
            } else {
                botSpeak('chat', "I'm sorry we are not using a DJQ right now @" + commandObj.data.name);
            }
            break;
        case 'q-':
            if ((config.usedb) && (config.useDjq)) {
                userRemDjq(commandObj.data.userid, commandObj.data.name);
            } else {
                botSpeak('chat', "I'm sorry we are not using a DJQ right now @" + commandObj.data.name);
            }
            break;
        case 'q':
            if (config.usedb) {
                returnDjq();
            }
            break;
        case 'clearq':
            if ((config.usedb)) {
                if (spkr.isMod || spkr.isOwner || spkr.isJBIRD) {
                    ModClearDjq();
                } else {
                    botSpeak(where, "I'm sorry that is a Mod command.", commandObj.pmID);
                }
            }
            break;
        case 'rem':
            if (config.usedb) {
                if (spkr.isMod || spkr.isOwner || spkr.isJBIRD) {
                    var username = param;
                    ModRemDjq(username);
                } else {
                    botSpeak(where, "I'm sorry that is a Mod command.", commandObj.pmID);
                }
            }
            break;


        //DJ COMMANDS                                                                                                                                                                                                                                                                                                                                        
        case 'afk':
            var time = parseInt(param);
            time = ((typeof (time) === "number") && (time > 0)) ? time : 15;
            if (spkr.isDj || spkr.isMod || spkr.isOwner || spkr.isJBIRD) {
                botSpeak(where, getAfkTimes(time), commandObj.pmID);
            } else {
                botSpeak(where, "I'm sorry that is a DJ or Mod command.", commandObj.pmID);
            }
            break;
        case 'idle':
            if (spkr.isDj || spkr.isMod || spkr.isOwner || spkr.isJBIRD) {
                botSpeak(where, getIdleTimes(), commandObj.pmID);
            } else {
                botSpeak(where, "I'm sorry that is a DJ or Mod command.", commandObj.pmID);
            }
            break;

        //MODERATOR COMMANDS                                                
        case 'uptime':
            if (spkr.isMod || spkr.isOwner || spkr.isJBIRD) {
                botSpeak(where, getUpTime(), commandObj.pmID);
            } else {
                botSpeak(where, "I'm sorry that is a Mod command.", commandObj.pmID);
            }
            break;
        case 'userlist':
            var hours = parseInt(param);
            hours = ((typeof (hours) === "number") && (hours > 0)) ? hours : 24;
            if (spkr.isMod || spkr.isOwner || spkr.isJBIRD) {
                botSpeak(where, getuserlist(), commandObj.pmID);
            } else {
                botSpeak(where, "I'm sorry that is a Mod command.", commandObj.pmID);
            }
            break;
        case 'status':
            if (spkr.isMod || spkr.isOwner || spkr.isJBIRD) {
                botSpeak(where, ':sparkles:Theme set to: ' + config.roomTheme
                + ' :sparkles:New Track Mode set to: ' + config.newMode
                + ' :sparkles:AFK deck checking is set to: ' + config.afkCheck + ' escorting at ' + config.afkMin + ' minutes.'
                + ' :sparkles:AFK crowd checking set to: ' + config.crowdCheck + ' and at ' + config.inactiveLimit + ' hours.'
                + ' :sparkles:Deck play limit is ' + config.deckcheck + ' at: ' + config.deckHours + ' hours.'
                + ' :sparkles:Song play limit is ' + config.songCheck + ' and set to ' + config.deckPlays + ' plays.'
                + ' :sparkles:Song Timer is set to ' + config.songTimer + ', songlimit is ' + config.songLimit + ' minutes.'
                + ' :sparkles:Personal greetings set to: ' + config.perGreetings
                + ' :sparkles:new person greets are set to: ' + config.newgreets
                + ' :sparkles:autobop is set to: ' + config.autobop
                + ' :sparkles:Games is set to: ' + config.games, commandObj.pmID);
            } else {
                botSpeak(where, "I'm sorry that is a Mod command.", commandObj.pmID);
            }
            break;
        case 'usedjq':
            if (spkr.isMod || spkr.isOwner || spkr.isJBIRD) {
                config.useDjq = param;
                botSpeak(where, 'useDjq set to: ' + config.useDjq, commandObj.pmID);
                botSpeak('console', 'useDjq set to: ' + config.useDjq + " by: " + getUserName(commandObj.data.senderid));
                addBotlogToDb(config.userid, 'useDjq set to: ' + config.useDjq + " by: " + getUserName(commandObj.data.senderid));
            } else {
                botSpeak(where, "I'm sorry that is a Mod command.", commandObj.pmID);
            }
            break;
        case 'setnewmode':
            if (spkr.isMod || spkr.isOwner || spkr.isJBIRD) {
                config.newMode = param;
                botSpeak(where, 'newMode set to: ' + config.newMode, commandObj.pmID);
            } else {
                botSpeak(where, "I'm sorry that is a Mod command.", commandObj.pmID);
            }
            break;
        case 'newcount':
            if (config.newmode) {
                botSpeak('chat', "The newCount is at: " + newCount);
            }
            break;
        case 'newmodestat':
            if (spkr.isMod || spkr.isOwner || spkr.isJBIRD) {
                botSpeak(where, 'New Track Mode set to: ' + config.newMode, commandObj.pmID);
            } else {
                botSpeak(where, "I'm sorry that is a Mod command.", commandObj.pmID);
            }
            break;
        case 'crowdcheck':
            if (spkr.isMod || spkr.isOwner || spkr.isJBIRD) {
                var toggle = param;
                config.crowdCheck = toggle;
                botSpeak(where, 'crowdCheck set to: ' + config.crowdCheck, commandObj.pmID);
                botSpeak('console', 'crowdCheck set to: ' + config.crowdCheck + " by: " + getUserName(commandObj.data.senderid));
                addBotlogToDb(config.userid, 'crowdCheck set to: ' + config.crowdCheck + " by: " + getUserName(commandObj.data.senderid));
            } else {
                botSpeak(where, "I'm sorry that is a Mod command.", commandObj.pmID);
            }
            break;
        case 'setcrowdcheck':
            if (spkr.isMod || spkr.isOwner || spkr.isJBIRD) {
                config.inactiveLimit = param;
                botSpeak(where, 'inactiveLimit set to: ' + config.inactiveLimit + " hours.", commandObj.pmID);
                botSpeak('console', 'inactiveLimit set to: ' + config.inactiveLimit + " hours." + " by: " + getUserName(commandObj.data.senderid));
                addBotlogToDb(config.userid, 'inactiveLimit set to: ' + config.inactiveLimit + " hours." + " by: " + getUserName(commandObj.data.senderid));
            } else {
                botSpeak(where, "I'm sorry that is a Mod command.", commandObj.pmID);
            }
            break;
        case 'crowdcheckstat':
            if (spkr.isMod || spkr.isOwner || spkr.isJBIRD) {
                botSpeak(where, 'AFK crowd checking set to: ' + config.crowdCheck + ' and at ' + config.inactiveLimit + ' hours.', commandObj.pmID);
            } else {
                botSpeak(where, "I'm sorry that is a Mod command.", commandObj.pmID);
            }
            break;
        case 'pgreets':
            if (spkr.isOwner || spkr.isJBIRD) {
                config.perGreetings = param;
                botSpeak(where, 'Personal greetings set to: ' + config.perGreetings, commandObj.pmID);
                addBotlogToDb(config.userid, 'Personal greetings set to: ' + config.perGreetings + " by: " + getUserName(commandObj.data.senderid));
            } else {
                botSpeak(where, "I'm sorry that is a Mod command.", commandObj.pmID);
            }
            break;
        case 'newgreets':
            if (spkr.isOwner || spkr.isJBIRD) {
                config.newgreets = param;
                botSpeak(where, 'new person greets are set to: ' + config.newgreets, commandObj.pmID);
                addBotlogToDb(config.userid, 'newgreets set to: ' + config.newgreets + " by: " + getUserName(commandObj.data.senderid));
            } else {
                botSpeak(where, "I'm sorry that is a Mod command.", commandObj.pmID);
            }
            break;
        case 'pgreetsstat':
            if (spkr.isOwner || spkr.isJBIRD) {
                botSpeak(where, 'Personal greetings set to: ' + config.perGreetings, commandObj.pmID);
            } else {
                botSpeak(where, "I'm sorry that is a Mod command.", commandObj.pmID);
            }
            break;
        case 'afkcheck':
            if (spkr.isMod || spkr.isOwner || spkr.isJBIRD) {
                config.afkCheck = param;
                botSpeak(where, 'AFK deck checking is set to: ' + config.afkCheck, commandObj.pmID);
                botSpeak('console', 'afkcheck set to: ' + config.afkCheck + " by: " + getUserName(commandObj.data.senderid));
                addBotlogToDb(config.userid, 'afkcheck set to: ' + config.afkCheck + " by: " + getUserName(commandObj.data.senderid));
            } else {
                botSpeak(where, "I'm sorry that is a Mod command.", commandObj.pmID);
            }
            break;
        case 'setafk':
            if (spkr.isMod || spkr.isOwner || spkr.isJBIRD) {
                config.afkMin = param;
                botSpeak(where, 'afkCheck Minutes set to: ' + config.afkMin, commandObj.pmID);
            } else {
                botSpeak(where, "I'm sorry that is a Mod command.", commandObj.pmID);
            }
            break;
        case 'afkcheckstat':
            if (spkr.isMod || spkr.isOwner || spkr.isJBIRD) {
                botSpeak(where, 'AFK deck checking is set to: ' + config.afkCheck + ' escorting at ' + config.afkMin + ' minutes.', commandObj.pmID);
            } else {
                botSpeak(where, "I'm sorry that is a Mod command.", commandObj.pmID);
            }
            break;
        case 'autobop':
            if (spkr.isMod || spkr.isOwner || spkr.isJBIRD) {
                config.autobop = param;
                config.danceMode = true;
                bot.vote('up');
                botSpeak(where, 'autobop set to: ' + config.autobop, commandObj.pmID);
                botSpeak('console', 'autobop set to: ' + config.autobop + " by: " + getUserName(commandObj.data.senderid));
                addBotlogToDb(config.userid, 'autobop set to: ' + config.autobop + " by: " + getUserName(commandObj.data.senderid));
            } else {
                botSpeak(where, "I'm sorry that is a Mod command.", commandObj.pmID);
            }
            break;
        case 'autobopstat':
            if (spkr.isMod || spkr.isOwner || spkr.isJBIRD) {
                botSpeak(where, 'autobop is set to: ' + config.autobop, commandObj.pmID);
            } else {
                botSpeak(where, "I'm sorry that is a Mod command.", commandObj.pmID);
            }
            break;
        case 'setgames':
            if (spkr.isMod || spkr.isOwner || spkr.isJBIRD) {
                config.games = param;
                botSpeak(where, "Games set to: " + config.games, commandObj.pmID);
            } else {
                botSpeak(where, "I'm sorry that is a Mod command.", commandObj.pmID);
            }
            break;
        case 'setsexy':
            if (spkr.isMod || spkr.isOwner || spkr.isJBIRD) {
                config.sexy = param;
                botSpeak(where, "sexy Mode set to: " + config.sexy, commandObj.pmID);
            } else {
                botSpeak(where, "I'm sorry that is a Mod command.", commandObj.pmID);
            }
            break;
        case 'songtimer':
            if (spkr.isMod || spkr.isOwner || spkr.isJBIRD) {
                config.songTimer = param;
                botSpeak(where, 'songtimer set to: ' + config.songTimer, commandObj.pmID);
                botSpeak('console', 'songtimer set to: ' + config.songTimer + " by: " + getUserName(commandObj.data.senderid));
                addBotlogToDb(config.userid, 'songtimer set to: ' + config.songTimer + " by: " + getUserName(commandObj.data.senderid));
            } else {
                botSpeak(where, "I'm sorry that is a Mod command.", commandObj.pmID);
            }
            break;
        case 'setlimit':
            if (spkr.isMod || spkr.isOwner || spkr.isJBIRD) {
                config.songLimit = parseInt(param);
                botSpeak('chat', 'Song limit has been set to ' + config.songLimit + ' minutes starting next track. (however I do not escort at this time)');
            } else {
                botSpeak(where, "I'm sorry that is a Mod command.", commandObj.pmID);
            }
            break;
        case 'songlimitstat':
            if (spkr.isMod || spkr.isOwner || spkr.isJBIRD) {
                botSpeak(where, 'Song Timer is set to ' + config.songTimer + ', songlimit is ' + config.songLimit + ' minutes.', commandObj.pmID);
            } else {
                botSpeak(where, "I'm sorry that is a Mod command.", commandObj.pmID);
            }
            break;
        case 'setdeckcheck':
            if (spkr.isMod || spkr.isOwner || spkr.isJBIRD) {
                config.deckcheck = param;
                botSpeak('chat', 'Deck limit has been set to ' + config.deckHours + " hours, set to: " + config.deckcheck);
            } else {
                botSpeak(where, "I'm sorry that is a Mod command.", commandObj.pmID);
            }
            break;
        case 'setdecklimit':
            if (spkr.isMod || spkr.isOwner || spkr.isJBIRD) {
                config.deckHours = parseInt(param);
                botSpeak('chat', 'Deck limit has been set to ' + config.deckHours + " hours, set to: " + config.deckcheck);
            } else {
                botSpeak(where, "I'm sorry that is a Mod command.", commandObj.pmID);
            }
            break;
        case 'decklimitstat':
            if (spkr.isMod || spkr.isOwner || spkr.isJBIRD) {
                botSpeak(where, 'Deck play limit is ' + config.deckcheck + ' at: ' + config.deckHours + ' hours.', commandObj.pmID);
            } else {
                botSpeak(where, "I'm sorry that is a Mod command.", commandObj.pmID);
            }
            break;
        case 'usetime':
            if (spkr.isMod || spkr.isOwner || spkr.isJBIRD) {
                config.deckcheck = true;
                escortId = null;
                config.songCheck = false;
                botSpeak(where, 'deckcheck set to: ' + config.deckcheck + " " + config.deckHours + " hours.", commandObj.pmID);
                botSpeak('console', 'deckcheck set to: ' + config.deckcheck + " " + config.deckHours + " hours." + " by: " + getUserName(commandObj.data.senderid));
                addBotlogToDb(config.userid, 'deckcheck set to: ' + config.deckcheck + " " + config.deckHours + " hours." + " by: " + getUserName(commandObj.data.senderid));
            } else {
                botSpeak(where, "I'm sorry that is an Owner command.", commandObj.pmID);
            }
            break;
        case 'useplays':
            if (spkr.isMod || spkr.isOwner || spkr.isJBIRD) {
                config.songCheck = true;
                config.deckcheck = false;
                botSpeak(where, 'songCheck set to: ' + config.songCheck + " " + config.deckPlays + " plays.", commandObj.pmID);
                botSpeak('console', 'songCheck set to: ' + config.songCheck + " " + config.deckPlays + " plays." + " by: " + getUserName(commandObj.data.senderid));
                addBotlogToDb(config.userid, 'songCheck set to: ' + config.songCheck + " " + config.deckPlays + " plays." + " by: " + getUserName(commandObj.data.senderid));
            } else {
                botSpeak(where, "I'm sorry that is an Owner command.", commandObj.pmID);
            }
            break;
        case 'setplays':
            if (spkr.isMod || spkr.isOwner || spkr.isJBIRD) {
                config.deckPlays = param;
                botSpeak(where, 'deckPlays set to: ' + config.deckPlays, commandObj.pmID);
                botSpeak('console', 'deckPlays set to: ' + config.deckPlays + " by: " + getUserName(commandObj.data.senderid));
                addBotlogToDb(config.userid, 'deckPlays set to: ' + config.deckPlays + " by: " + getUserName(commandObj.data.senderid));
            } else {
                botSpeak(where, "I'm sorry that is an Owner command.", commandObj.pmID);
            }
            break;
        case 'theme':
            if (spkr.isMod || spkr.isOwner || spkr.isJBIRD) {
                config.roomTheme = param;
                botSpeak('chat', 'Theme set to: ' + config.roomTheme, commandObj.pmID);
                botSpeak('console', 'roomTheme set to: ' + config.roomTheme + " by: " + getUserName(commandObj.data.senderid));
                addBotlogToDb(config.userid, 'roomTheme set to: ' + config.roomTheme + " by: " + getUserName(commandObj.data.senderid));
            } else {
                botSpeak(where, "I'm sorry that is an Owner command.", commandObj.pmID);
            }
            break;
        case 'dj':
            if (spkr.isMod || spkr.isOwner || spkr.isJBIRD) {
                bot.addDj();
                ttRoom.botOnDeck = true;
            } else {
                botSpeak(where, "I'm sorry that is a Mod command.", commandObj.pmID);
            }
            break;
        case 'djhelp':
            if (spkr.isMod || spkr.isOwner || spkr.isJBIRD) {
                if (Object.keys(ttRoom.djList).length < 2) {
                    bot.modifyLaptop('chrome');
                    ttRoom.djHelper = true;
                    bot.addDj();
                    ttRoom.botOnDeck = true;
                }
            } else {
                botSpeak(where, "I'm sorry that is a Mod command.", commandObj.pmID);
            }
            break;
        case 'hold':
            if (spkr.isMod || spkr.isOwner || spkr.isJBIRD) {
                bot.addDj();
                config.holdMode = true;
                ttRoom.botOnDeck = true;
            } else {
                botSpeak(where, "I'm sorry that is a Mod command.", commandObj.pmID);
            }
            break;
        case 'down':
            if (spkr.isMod || spkr.isOwner || spkr.isJBIRD) {
                bot.remDj();
                config.holdMode = false;
                ttRoom.botOnDeck = false;
                ttRoom.djHelper = false;
            } else {
                botSpeak(where, "I'm sorry that is a Mod command.", commandObj.pmID);
            }
            break;
        case 'fans':
            bot.getFans(function (data) { console.log(data); });
            break;
        case 'skip':
            if (spkr.isMod || spkr.isOwner || spkr.isJBIRD) {
                bot.stopSong();
            } else {
                botSpeak(where, "I'm sorry that is a Mod command.", commandObj.pmID);
            }
            break;
        case 'autobot':
            if (spkr.isMod || spkr.isOwner || spkr.isJBIRD) {
                config.autobot = param;
                botSpeak('console', 'autobot set to: ' + config.autobot + " by: " + commandObj.data.name);
                addBotlogToDb(config.userid, 'autobot set to: ' + config.autobot + " by: " + commandObj.data.name);
            } else {
                botSpeak(where, "I'm sorry that is a Mod command.", commandObj.pmID);
            }
            break;
        case 'autodj':
            if (spkr.isMod || spkr.isOwner || spkr.isJBIRD) {
                config.autoDj = param;
                botSpeak('console', 'autodj set to: ' + config.autodj + " by: " + commandObj.data.name);
                addBotlogToDb(config.userid, 'autodj set to: ' + config.autodj + " by: " + commandObj.data.name);
            } else {
                botSpeak(where, "I'm sorry that is a Mod command.", commandObj.pmID);
            }
            break;
        case 'avatar':
            if (spkr.isMod || spkr.isOwner || spkr.isJBIRD) {
                bot.setAvatar(param);
            } else {
                botSpeak(where, "I'm sorry that is a Mod command.", commandObj.pmID);
            }
            break;
        case 'speak':
            var say = commandObj.paramOrig || commandObj.param;
            if (spkr.isMod || spkr.isOwner || spkr.isJBIRD) {
                botSpeak('chat', say);
            } else {
                botSpeak(where, "I'm sorry that is a Mod command.", commandObj.pmID);
            }
            break;
        case 'snatch':
            if (spkr.isMod || spkr.isOwner || spkr.isJBIRD) {
                bot.playlistAll(function (data) {
                    bot.playlistAdd(currentSong.songId, data.list.length);
                });
                bot.snag();
            } else {
                botSpeak(where, "I'm sorry that is a Mod command.", commandObj.pmID);
            }
            break;
        case 'lame':
            if (spkr.isMod || spkr.isOwner || spkr.isJBIRD) {
                bot.vote('down');
            } else {
                botSpeak(where, "I'm sorry that is an Mod command.", commandObj.pmID);
            }
            break;
        case 'pmmods':
            if (spkr.isMod) {
                var text = ":exclamation:" + param + ":exclamation:";
                pmMods(text, false);
            } else {
                botSpeak(where, "I'm sorry that is an Mod command.", commandObj.pmID);
            }
            break;

        //OWNER ONLY COMMANDS                                             

        case 'time':
            var date = new Date();
            botSpeak('chat', date);
            break;
        case 'setenter':
            if (spkr.isOwner || spkr.isJBIRD) {
                config.enterPM = param;
                botSpeak(where, "enter pm set to: " + config.enterPM, commandObj.pmID);
            }
            break;
        case 'setentersay':
            var Msg = commandObj.paramOrig || commandObj.param;
            if (spkr.isOwner || spkr.isJBIRD) {
                config.enterPM = true;
                config.enterMsg = Msg;
                botSpeak(where, "enter pm set to: " + config.enterPM + " and says: " + config.enterMsg, commandObj.pmID);
                setEnterMsg(config.enterMsg);
            }
            break;
        case 'enterstat':
            if (spkr.isOwner || spkr.isJBIRD) botSpeak(where, config.enterPM + ": " + config.enterMsg, commandObj.pmID);
            break;
        case 'followme':
            if (spkr.isOwner || spkr.isJBIRD) {
                config.followMe = param;
                botSpeak(where, "followMe set to: " + config.followMe, commandObj.pmID);
            } else {
                botSpeak(where, "I'm sorry that is an owner command or config.followMe= " + config.followMe, commandObj.pmID);
            }
            break;
        case 'findme':
            if ((spkr.isOwner || spkr.isJBIRD) && (config.followMe)) {
                findOwner();
            } else {
                botSpeak(where, "I'm sorry that is an owner command or config.followMe= " + config.followMe, commandObj.pmID);
            }
            break;
        case 'ftp':
            if (spkr.isOwner || spkr.isJBIRD) {
                getFtp();
            } else {
                botSpeak(where, "I'm sorry that is an owner command.", commandObj.pmID);
            }
            break;
        case 'setdeckcontrol':
            if (config.usedb) {
                if (spkr.isOwner || spkr.isJBIRD) {
                    config.deckControl = param;
                    botSpeak(where, 'deckControl is set to' + config.deckControl, commandObj.pmID);
                } else {
                    botSpeak(where, "I'm sorry that is a Mod command.", commandObj.pmID);
                }
            }
            break;
        case 'addallowed':
            if (spkr.isOwner || spkr.isJBIRD) {
                var username = param;
                addAllowedDj(username);
            } else {
                botSpeak(where, "I'm sorry that is an Owner command.", commandObj.pmID);
            }
            break;
        case 'remallowed':
            if (spkr.isOwner || spkr.isJBIRD) {
                var username = param;
                remAllowedDj(username);
            } else {
                botSpeak(where, "I'm sorry that is an Owner command.", commandObj.pmID);
            }
            break;
        case 'clearallowed':
            if (spkr.isOwner || spkr.isJBIRD) {
                clearAllowedDjs();
            } else {
                botSpeak(where, "I'm sorry that is an Owner command.", commandObj.pmID);
            }
            break;
    }
};

// ============= EVENT FUNCTIONS ==================

var onReady = function (data) {
    bot.roomRegister(config.roomid);
    getEnterMsg();
    getQlength();
    if (config.addStats) {
        addBotlogToDb(config.userid, config.botName + '********bot started.********');
    }
    botSpeak('console', config.botName + " started at: " + startTime);
};

var onDeregistered = function (data) {
    var user = data.user[0];
    //remove user from userList
    if (user.userid != config.userid && user.userid != config.battlebot)
        delete ttRoom.userList[user.userid];
};


//registered (when a user enters the room)
var onRegistered = function (data) {
    var visited = false;
    var user = data.user[0];
    var username = data.user[0].name;
    bot.becomeFan(user.userid);

    //add user to userList
    if ((user.userid != config.userid) && (user.userid != config.battlebot)) {
        user.lastActivity = new Date();
        ttRoom.userList[user.userid] = user;
    }

    //query db for blacklist entries
    if (config.usedb) {
        var cmd = "SELECT userid, username, reason FROM " + config.botName + "blacklist WHERE (userid = '" + user.userid + "')";
        client.query(cmd, function (err, results) {
            if (err) {
                botSpeak('console', error + " onRegistered");
            }
            if ((results.length !== undefined) && (results.length > 0)) {
                bot.bootUser(user.userid, 'You have been blacklisted for ' + results[0].reason);
                botSpeak('console', "BLACKLIST BOOT: " + user.name + " : " + user.userid + " for " + results[0].reason);
                addBotlogToDb(config.userid, "BLACKLIST BOOT: " + user.name + " : " + user.userid + " for " + results[0].reason);
            }
        });
    }

    if (config.perGreetings) {
        getPersonalGreet(user.userid);
        pmMods(user.name + " joined", true);
    }

    if (config.newgreets) {
        discoverNewUser(user);
    }

    if (((config.usedb) && (config.addStats))) {
        updateUsers(user);
    }

    //GREETINGS
    if (config.enterPM) {
        botSpeak('pm', config.enterMsg, data.user[0].userid);
    }
};

var onRoomChanged = function (data) {
    for (var i = 0; i < data.users.length; i++) {
        if (data.users[i].userid == config.botOwner) {
            break;
        }
    }
    addCurrentSongToHistory(data);

    if (config.autobop) selfCommand('dance');

    ttRoom.roomMods = data.room.metadata.moderator_id;

    // add all users to userList
    ttRoom.userList = {};
    var users = data.users;
    for (var i = 0; i < users.length; i++) {
        var user = users[i];
        if (user.userid != config.userid && user.userid != config.battlebot) {
            user.lastActivity = new Date();
            ttRoom.userList[user.userid] = user;
        }
    }
};

var onBootedUser = function (data) {
    if (config.addStats) {
        var userid = data.userid;
        var username = getUserName(data.userid);
        var mod = getUserName(data.modid);
        var reason = data.reason;
        if (config.usedb) {
            addBotlogToDb(data.modid, mod + " booted " + userid + " " + username + " " + reason);
        }
    }
}


//speak
var onSpeak = function (data) {
    var text = data.text;
    var username = data.name;
    var userid = data.userid;

    if ((config.usedb) && (config.addStats)) {
        addChatToDb(userid, username, text);
    }

    if (config.watchMode) {
        bot.getProfile(data.userid, function (data) {
            botSpeak('pm', name + ': ' + text, config.botOwner);
        });
    }

    var isOwner = (data.userid === config.botOwner);
    var isJBIRD = (data.userid === config.JBIRD);
    var isSelf = (data.userid === config.userid);
    var isModerator = ttRoom.roomMods.indexOf(userid) > -1 ? true : false;
    var isDj = ttRoom.djList[userid] ? true : false;

    //CUSTOM chat text
    if (config.games) {
        if (text.match(/requesting flyby/i)) botSpeak('chat', "Negative, Ghost Rider, the pattern is full.");
        if (text.match(/ARMAGEDDON/i)) botSpeak('chat', "RAGGID GET OUTTA THERE! http://youtu.be/cTrOb8zyrZk");
    }
    if (config.sexy) {
        if (text.match(/cock/i)) botSpeak('chat', "8=====D");
        if (text.match(/mulva/i)) botSpeak('chat', "Which would you like? (|) or (O)");
    }

    var greetings = config.botGreetings;
    var result;
    if (isOwner || isModerator || isJBIRD) {
        greetings = greetings.concat(config.botGreetingsGeneric);
    }

    for (var i = 0, len = greetings.length; i < len; i++) {
        var pattern = new RegExp('(^' + greetings[i] + ')(.*?)( .*)?$');
        result = text.match(pattern);
        textLower = text.toLowerCase();
        resultLower = textLower.match(pattern);
        if (result) break;
    }

    if (result) {
        var greeting = result[1].trim().toLowerCase();
        var command = result[2].trim().toLowerCase();
        var param = '';
        var paramOrig = '';
        if (result.length == 4 && result[3]) {
            param = result[3].trim().toLowerCase();
            paramOrig = result[2].trim();
        }

        var who = {
            isOwner: isOwner,
            isJBIRD: isJBIRD,
            isSelf: isSelf,
            isMod: isModerator,
            isDj: isDj
        };

        var commandObj = {
            'command': command,
            'param': param,
            'paramOrig': paramOrig,
            'who': who,
            'data': data,
            'where': 'chat'
        };
        doCommand(commandObj);
    }
};

var onPM = function (data) {
    var isOwner = (data.senderid === config.botOwner);
    var isJBIRD = (data.senderid === config.JBIRD);
    var isSelf = (data.senderid === config.userid);
    var isModerator = ttRoom.roomMods.indexOf(data.senderid) > -1 ? true : false;
    var isDj = ttRoom.djList[data.senderid] ? true : false;

    var pattern = new RegExp('(.*?)( .*)?$');
    var result = data.text.match(pattern);

    if (result) {
        var command = result[1].trim().toLowerCase();
        var param = '';
        var paramOrig = '';
        if (result.length == 3 && result[2]) {
            param = result[2].trim().toLowerCase();
            paramOrig = result[2].trim();
        }

        var who = {
            isOwner: isOwner,
            isJBIRD: isJBIRD,
            isSelf: isSelf,
            isMod: isModerator,
            isDj: isDj
        };

        var commandObj = {
            'command': command,
            'param': param,
            'paramOrig': paramOrig,
            'who': who,
            'data': data,
            'where': 'pm',
            'pmID': data.senderid
        };

        doCommand(commandObj);
        //doCommand(command, param, who, data);
    }
};

// Add everyone in the users list.
var onRoomChangedAfkTimer = function (data) {
    var djs = data.room.metadata.djs;
    ttRoom.djList = {};
    var len = djs.length;
    for (var i = 0; i < len; i++) {
        bot.getProfile(djs[i], function (data) {
            var user = {};
            user.userid = data.userid;
            user.name = data.name;
            user.lastActivity = new Date();
            user.startedSpinning = new Date();
            user.plays = 0;
            ttRoom.djList[user.userid] = user;
        });
    }
};

// Someone stopped dj'ing, remove them from the dj list
// add them to the recent DJs list
var onRemDj = function (data) {
    // add the user who is stepping down to the recent DJ list
    ttRoom.recentDjs[data.user[0].userid] = ttRoom.djList[data.user[0].userid];
    ttRoom.recentDjs[data.user[0].userid].steppedDown = new Date();
    delete ttRoom.djList[data.user[0].userid];

    // also, if the bot is in autodj mode
    if (config.autoDj) {
        // check how many users on deck
        var djCount = Object.keys(ttRoom.djList).length;
        if (djCount === 1) {
            selfCommand("speak", "Hi! I'm just here to help. I'll step down when someone else gets on deck.");
            selfCommand('djhelp');
        }
    }
};

// Someone starts dj'ing, add them.
var onAddDj = function (data) {
    var user = data.user[0];
    var now = new Date();
    var offDeckTime = null;
    // first check if they are a recent DJ
    var userid = user.userid;
    var username = user.name;
    if (ttRoom.recentDjs[userid] !== undefined) {
        // check when they stepped down
        offDeckTime = now - ttRoom.recentDjs[userid].steppedDown;
        // if the different is over 2 minutes, they aren't 'recent' anymore
        // just readd the user
        if (offDeckTime > 120000) {
            addUserToDJList(user);
        } else {
            // else add the user from the recent list and delete from recent DJs
            ttRoom.djList[user.userid] = ttRoom.recentDjs[userid];
            delete ttRoom.recentDjs[userid];
        }
    } else {
        addUserToDJList(user);
    }

    if (config.deckControl) {
        escortNotAllowedDj(userid);
    }

    // also, if the bot is on deck in djHelper mode
    if (ttRoom.djHelper) {
        // check how many users on deck
        var djCount = Object.keys(ttRoom.djList).length;
        // step down if there are more than two other djs.
        if (djCount > 2) {
            selfCommand('down');
        }
    }
};

// Someone vote, update his timestamp.
var onUpdateVotesTimestamp = function (data) {
    var percentAwe = 0;
    var votelog = data.room.metadata.votelog;
    for (var i = 0; i < votelog.length; i++) {
        var userid = votelog[i][0];
        var vote = votelog[i][1];

        //if lame pm mods
        if ((vote === 'down') && (config.perGreetings)) {
            var name = getUserName(userid);
            str = util.format('lamer @%s', name);
            pmMods(str, true);
        }
        if (ttRoom.djList[userid] !== undefined) {
            ttRoom.djList[userid].lastActivity = new Date();
        }
        if (ttRoom.userList[userid] !== undefined) {
            ttRoom.userList[userid].lastActivity = new Date();
        }
    }
};

// on some actions, update the DJ lastActivity
var updateDjTimestamp = function (data) {
    var userid = data.userid;
    if (ttRoom.djList[userid] !== undefined) {
        ttRoom.djList[data.userid].lastActivity = new Date();
    }
    var userObj = ttRoom.userList[userid];
};

var updateUserTimestamp = function (data) {
    var userid = data.userid;
    var name = data.name;
    if ((ttRoom.userList[userid] !== undefined) && (data.userid != config.userid)) {
        ttRoom.userList[userid].lastActivity = new Date();
    }
};

//newsong
var onNewSong = function (data) {
    var songId = data.room.metadata.current_song._id;
    var genre = data.room.metadata.current_song.metadata.genre;
    var songTitle = data.room.metadata.current_song.metadata.song;
    var artist = data.room.metadata.current_song.metadata.artist;
    var djId = data.room.metadata.current_song.djid;
    var djName = data.room.metadata.current_song.djname;

    var NewSongLimitMin = config.songLimit; //minutes
    NewSongLimit = NewSongLimitMin * 60; //convert to seconds 
    var NewSongLen = (data.room.metadata.current_song.metadata.length);

    if (config.songTimer && (NewSongLen > (NewSongLimit + 30/*add 30 seconds to give a 'buffer'*/)) && (djId != config.userid)) {
        var min = (((data.room.metadata.current_song.metadata.length - NewSongLimit) / 60) - ((((data.room.metadata.current_song.metadata.length - NewSongLimit) / 60) % 1)));
        var sec = Math.round(((((((data.room.metadata.current_song.metadata.length - NewSongLimit) / 60) % 1) * 60) * 100) / 100), 2);
        if (sec < 10) sec = '0' + sec.toString();
        botSpeak('chat', '@' + djName + ' Track length greater than ' + NewSongLimitMin + ' minutes, please skip with '
        + min + ':' + sec + ' remaining.');
    }

    if (config.games) {
        if (songTitle.match(/whistle/i)) botSpeak('chat', "WoWOOOOOO!!! IT'S ALL ABOUT THE WHISTLES!");
        if (songTitle.match(/sail/i)) botSpeak('chat', "SAIL! http://www.youtube.com/watch?v=Veg63B8ofnQ");
    }

    if (escortId !== null) {
        bot.remDj(escortId);
        escortId = null;
        if (config.useDjq) {
            getFirstonQ();
        }
    }

    //useplays
    if (config.songCheck) {
        addToPlayCount(djId);
    }

    if (config.songCheck) {
        if ((ttRoom.djList[djId] !== undefined) && (djId != config.userid)) {
            var user = ttRoom.djList[djId];
            if (user.plays >= config.deckPlays) {
                escortId = djId;
            }
        }
    }

    if (config.newMode) { getTrackStats(songTitle); }

    //autobop workings
    var min = 10000;
    var max = 25000;
    var rand = Math.floor(Math.random() * (max - min + 1)) + min;

    if (config.autobop) { setTimeout(function () { bot.vote('up'); }, rand); }

    if (config.autobot) { setTimeout(function () { bot.speak('bot dance'); }, rand); }

    if (isRoomMod(djId)) { setTimeout(function () { bot.vote('up'); }, 40000); }

    // if the bot is the one playing the song, check and see if "holdMode" is set
    // if true, skip the song. 
    if ((data.room.metadata.current_dj === config.userid) && config.holdMode) { selfCommand('skip'); }

    addCurrentSongToHistory(data);

};

function WriteToLog(log, text) {
    var now = dateFormat(new Date(), "%Y-%m-%d %H:%M:%S", false);
    fs.createWriteStream(log, {
        flags: "a",
        encoding: "encoding",
        mode: 0666
    }).write(now + "|" + text + '\r\n');

    //    var stream = fs.createWriteStream(log);
    //    stream.once('open', function(fd) {
    //    stream.write(now + " " + text + '\r\n');

};

function dateFormat(date, fstr, utc) {
    utc = utc ? 'getUTC' : 'get';
    return fstr.replace(/%[YmdHMS]/g, function (m) {
        switch (m) {
            case '%Y': return date[utc + 'FullYear'](); // no leading zeros required
            case '%m': m = 1 + date[utc + 'Month'](); break;
            case '%d': m = date[utc + 'Date'](); break;
            case '%H': m = date[utc + 'Hours'](); break;
            case '%M': m = date[utc + 'Minutes'](); break;
            case '%S': m = date[utc + 'Seconds'](); break;
            default: return m.slice(1); // unknown code, remove %
        }
        // add leading zero if required
        return ('0' + m).slice(-2);
    });
}

var onUpdateVotes = function (data) {
    currentSong.votes['up'] = data.room.metadata.upvotes;
    currentSong.votes['down'] = data.room.metadata.downvotes;
    currentSong
};

var updateHeartCount = function (data) {
    currentSong.hearts = currentSong.hearts + 1;
};

var onNoSong = function (data) {
    if (config.autoDj) {
        selfCommand('djhelp');
        selfCommand('speak', 'I will jump down when two other people are on deck');
    }
};

function addMod(data) {
    pmMods(getUserName(data.userid) + ' has been modded.', false);
}

function remMod(data) {
    pmMods(getUserName(data.userid) + ' has been UNmodded.', false);
}

// ============= EXPORTED BOT ==================

var baseBot = {

    currVotes: { 'up': 0, 'down': 0 },

    init: function (botObj) {
        bot = botObj.bot;
        config = botObj.config;

        bot.on('ready', function (data) {
            onReady(data);
        });

        bot.on('registered', function (data) {
            onRegistered(data);
        });

        bot.on('deregistered', function (data) {
            onDeregistered(data);
        });

        bot.on('roomChanged', function (data) {
            onRoomChanged(data);
            onRoomChangedAfkTimer(data);
        });

        bot.on('booted_user', function (data) {
            onBootedUser(data);
        });

        bot.on('speak', function (data) {
            onSpeak(data);
            updateDjTimestamp(data);
            updateUserTimestamp(data);
        });

        bot.on('pmmed', function (data) {
            onPM(data);
        });

        bot.on('rem_dj', function (data) {
            onRemDj(data);
        });

        bot.on('add_dj', function (data) {
            onAddDj(data);
        });

        bot.on('update_votes', function (data) {
            onUpdateVotesTimestamp(data);
            onUpdateVotes(data);
        });

        bot.on('snagged', function (data) {
        });

        bot.on('new_moderator', function (data) {
            addMod(data);
        });

        bot.on('rem_moderator', function (data) {
            remMod(data);
        });

        bot.on('newsong', function (data) {
            onNewSong(data);
        });

        bot.on('endsong', function (data) {
        });

        bot.on('nosong', function (data) {
            onNoSong(data);
        });

    },

    commands: doCommand


};
module.exports = baseBot;
