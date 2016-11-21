// Application Log
var log4js = require('log4js');
var log4js_extend = require('log4js-extend');
log4js_extend(log4js, {
    path: __dirname,
    format: '(@file:@line:@column)'
});
// 取得執行目錄，以便找到 log4js.json 組態檔
var base_path = (process.env.BASE_PATH == undefined ? '' : process.env.BASE_PATH);
log4js.configure(base_path + './log4js.json');
var logger = log4js.getLogger('line');

// 建立 express service
var express = require('express');
var app = express();
var port = process.env.port || 1337;
var http = require('http');
var server = http.Server(app).listen(port);
var io = require('socket.io')(server);  // Socket.io 提供 SMI Snapin 連線，以便將訊息傳遞給 SMI
app.use(express.bodyParser());

var hashtable = require('./hashtable');
var rel_user_workitem = new hashtable.Hashtable;    // 紀錄 LINE ID 是否已建立對話
var rel_workitem_user = new hashtable.Hashtable;    // 對話與 LINE ID 反查表


app.all('*', function (req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.header('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type');
    next();
});
app.get('/', function (request, response) {
    response.send('Hello World!');
});
// 傳送訊息給指定的 LINE ID
app.get('/message/:line_id/:message/:password', function (request, response) {
    var line_id = request.params.line_id;
    var message = request.params.message;
    var password = request.params.password;
    if (password == 'tstiisacompanyfortatung') {
        var https = require('https');
        var data = {
            'to': [line_id],
            'toChannel': 1383378250,
            'eventType': '138311608800106203',
            'content': {
                'contentType': 1,
                'toType': 1,
                'text': message
            }
        };
        logger.info(JSON.stringify(data));
        var options = {
            host: 'api.line.me',
            port: '443',
            path: '/v1/events',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=UTF-8',
                'Content-Length': Buffer.byteLength(JSON.stringify(data)),
                'X-LINE-ChannelToken': 'X5WiRjcZwIdpcjwe9AD/Ote3PQKR5G904wv1UlunESx89ooGvTNvBg9KBc9K35dFfDKwGztVI2GC5PMUaDaEFdH8qlnT0hJ/D7cog1cv9Gvx8nkImsi8qx6j2YQHZDCue+Tv3zgdUy1I4qkv65WTqqlFKJG531yDaZgezYF19C0='
            }
        };
        
        logger.info('傳送訊息給 ' + line_id);
        var req = https.request(options, function (res) {
            res.setEncoding('utf8');
            res.on('data', function (chunk) {
                logger.info('Response: ' + chunk);
            });
        });
        req.write(JSON.stringify(data));
        req.end();
        response.write('success');
    } else {
        response.write('password is incorrect');
    }
    response.end();
});
// 接收來自 LINE ID 傳送的訊息
app.post('/', function (request, response) {
    logger.info(request.body);
    try {
        var results = request.body.result;
        logger.info('receive message count: ' + results.length);
        for (var idx = 0; idx < results.length; idx++) {
            logger.info('createdTime: ' + results[idx].createdTime);
            logger.info('eventType: ' + results[idx].eventType);
            logger.info('from: ' + results[idx].from);
            logger.info('fromChannel: ' + results[idx].fromChannel);
            logger.info('id: ' + results[idx].id);
            logger.info('to: ' + JSON.stringify(results[idx].to));
            logger.info('toChannel: ' + results[idx].toChannel);
            logger.info('content: ' + JSON.stringify(results[idx].content));
            
            if (results[idx].content.text == 'My ID') {     // (實驗室) 取得自己 ID
                var https = require('https');
                var data = {
                    'to': [results[idx].content.from],
                    'toChannel': 1383378250,
                    'eventType': '138311608800106203',
                    'content': {
                        'contentType': 1,
                        'toType': 1,
                        'text': results[idx].content.from
                    }
                };
                logger.info(JSON.stringify(data));
                var options = {
                    host: 'api.line.me',
                    port: '443',
                    path: '/v1/events',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json; charset=UTF-8',
                        'Content-Length': Buffer.byteLength(JSON.stringify(data)),
                        'X-LINE-ChannelToken': 'X5WiRjcZwIdpcjwe9AD/Ote3PQKR5G904wv1UlunESx89ooGvTNvBg9KBc9K35dFfDKwGztVI2GC5PMUaDaEFdH8qlnT0hJ/D7cog1cv9Gvx8nkImsi8qx6j2YQHZDCue+Tv3zgdUy1I4qkv65WTqqlFKJG531yDaZgezYF19C0='
                    }
                };
                
                logger.info('傳送訊息給 ' + results[idx].content.from);
                var req = https.request(options, function (res) {
                    res.setEncoding('utf8');
                    res.on('data', function (chunk) {
                        logger.info('Response: ' + chunk);
                    });
                });
                req.write(JSON.stringify(data));
                req.end();
            } else {
                if (snapin) {   // 傳遞訊息給 SMI
                    var acct = results[idx].content.from;
                    var message = results[idx].content.text;
                    if (rel_user_workitem.containsKey(acct)) {  // LINE ID 是否已建立會話
                        var workitem_id = rel_user_workitem.get(acct);
                        snapin.emit('message', message, workitem_id, acct);
                    } else {    // 建立新的會話
                        rel_user_workitem.add(acct, '');
                        snapin.emit('register', acct, acct);    // 註冊
                        snapin.emit('start_service', acct);     // 啟動新會話
                    }
                } else {    // 若 Snapin 未連線，回傳固定訊息給 LINE ID
                    var https = require('https');
                    var data = {
                        'to': [results[idx].content.from],
                        'toChannel': 1383378250,
                        'eventType': '138311608800106203',
                        'content': {
                            'contentType': 1,
                            'toType': 1,
                            'text': '我們已經收到您的訊息'
                        }
                    };
                    logger.info(JSON.stringify(data));
                    var options = {
                        host: 'api.line.me',
                        port: '443',
                        path: '/v1/events',
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json; charset=UTF-8',
                            'Content-Length': Buffer.byteLength(JSON.stringify(data)),
                            'X-LINE-ChannelToken': 'X5WiRjcZwIdpcjwe9AD/Ote3PQKR5G904wv1UlunESx89ooGvTNvBg9KBc9K35dFfDKwGztVI2GC5PMUaDaEFdH8qlnT0hJ/D7cog1cv9Gvx8nkImsi8qx6j2YQHZDCue+Tv3zgdUy1I4qkv65WTqqlFKJG531yDaZgezYF19C0='
                        }
                    };
                    var req = https.request(options, function (res) {
                        res.setEncoding('utf8');
                        res.on('data', function (chunk) {
                            logger.info('Response: ' + chunk);
                        });
                    });
                    req.write(JSON.stringify(data));
                    req.end();
                }
            }
        }
    } catch (e) {
        logger.error(e);
    }
    response.send('');
});

// 以下為 Snapin 界接相關程式碼
var snapin;
io.sockets.on('connection', function (client) {
    logger.info('snapin connected');
    snapin = client;
    client.on('ok', function (action, param) {
        logger.info('receive ok of action ' + action + ' from snapin');
        if (action == 'start_service') {
            var workitem_id = param.workitem.ID;
            var user = param.source;
            logger.info('workitem_id: ' + workitem_id);
            logger.info('user: ' + user);
            if (rel_user_workitem.containsKey(user)) {
                rel_user_workitem.remove(user);
            }
            rel_user_workitem.add(user, workitem_id);
            rel_workitem_user.add(workitem_id, user);
        }
    });
    client.on('message', function (user, message) {
        logger.info('receive message from snapin');
        logger.info('message: ' + message);
        var https = require('https');
        var data = {
            'to': [user],
            'toChannel': 1383378250,
            'eventType': '138311608800106203',
            'content': {
                'contentType': 1,
                'toType': 1,
                'text': message
            }
        };
        logger.info(JSON.stringify(data));
        var options = {
            host: 'api.line.me',
            port: '443',
            path: '/v1/events',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=UTF-8',
                'Content-Length': Buffer.byteLength(JSON.stringify(data)),
                'X-LINE-ChannelToken': 'X5WiRjcZwIdpcjwe9AD/Ote3PQKR5G904wv1UlunESx89ooGvTNvBg9KBc9K35dFfDKwGztVI2GC5PMUaDaEFdH8qlnT0hJ/D7cog1cv9Gvx8nkImsi8qx6j2YQHZDCue+Tv3zgdUy1I4qkv65WTqqlFKJG531yDaZgezYF19C0='
            }
        };
            
        logger.info('傳送訊息給 ' + user);
        var req = https.request(options, function (res) {
            res.setEncoding('utf8');
            res.on('data', function (chunk) {
                logger.info('Response: ' + chunk);
            });
        });
        req.write(JSON.stringify(data));
        req.end();
    });
    
    client.on('end_service', function (user) {
        logger.info('receive end_service from snapin');
        if (rel_user_workitem.containsKey(user)) {
            var workitem_id = rel_user_workitem.get(user);
            rel_workitem_user.remove(workitem_id);
            rel_user_workitem.remove(user);
        }
    });
    
    client.on('disconnect', function () {
        logger.info('receive disconnect from snapin');
        snapin = null;
    });

    client.on('profile', function (mid) {
        try {
            logger.info('receive profile from snapin');
            logger.info('mid: ' + mid);
            var https = require('https');
            var options = {
                host: 'api.line.me',
                port: '443',
                path: '/v1/profiles?mids=' + mid,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json; charset=UTF-8',
                    'X-LINE-ChannelToken': 'X5WiRjcZwIdpcjwe9AD/Ote3PQKR5G904wv1UlunESx89ooGvTNvBg9KBc9K35dFfDKwGztVI2GC5PMUaDaEFdH8qlnT0hJ/D7cog1cv9Gvx8nkImsi8qx6j2YQHZDCue+Tv3zgdUy1I4qkv65WTqqlFKJG531yDaZgezYF19C0='
                }
            };
            
            var req = https.request(options, function (res) {
                res.setEncoding('utf8');
                res.on('data', function (chunk) {
                    logger.info('Response: ' + chunk);
                    var result = JSON.parse(chunk);
                    logger.info('displayName: ' + result.contacts[0].displayName);
                    logger.info('mid: ' + result.contacts[0].mid);
                    logger.info('pictureUrl: ' + result.contacts[0].pictureUrl);
                    logger.info('statusMessage: ' + result.contacts[0].statusMessage);
                    snapin.emit('profile', result.contacts[0]);
                });
            }).end();
        } catch (e) {
            logger.error(e);
        }
    });
});

logger.info('service started.');