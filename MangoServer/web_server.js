'use strict';

const express = require('express'),
	http = require('http'),
	https = require('https'),
	util = require('util'),
	fs = require('fs'),
	WebSocket = require('ws');

const bodyParser = require("body-parser");

var commands = require("./commands");
var property = require('./property');

class WebServer {

	constructor(portNum) {
		var self = this;
		self.option = {
			key: fs.readFileSync(property.option.local.key),
			cert: fs.readFileSync(property.option.local.cert)
		};

		self.app = express();

		//this.httpServer = http.createServer(this.app);
		self.httpsServer = https.createServer(self.option, self.app);
		//this.socket = new WebSocket.Server({ server: this.httpServer });

		self.clients = {};
		self.stats = {
			hosts: global.utils.getIPAddress(),
			portNum: portNum,
			current: 0,
			allocate: 0,
			release: 0,
			request: 0,
			error: 0
		};

		//this.socket.on('connection', function (ws) { this.socketRequest(ws) });

		//this.httpServer.listen(portNum);

		self.httpsServer.listen(portNum);

		self.parser = require('./parser').createParser();

		self.seqNo = 1;

		self.app.get('/echo', function (req, res) {
			res.end("echo");
		});

		//global.debug('WebServer.listen. http.portNum:%s', portNum);

		Object.keys(commands).forEach(function (key) {
			var command = commands[key];

			command.forEach(function (name) {
				self.app.post('/' + name, function (req, res) {
					self.httpsRequest(name, req, res);
				});
			});
		});

		self.appKey = util.format('%s_%s', global.utils.getIPAddress(), portNum);

		//app_base_load
		global.apps.loadAppInfo();
		setInterval(function () { global.apps.loadAppInfo(function () { }) }, 30 * 1000);
	}

	httpsRequest(name, req, res) {
		var self = this;

		try {
			if (req.method === 'GET') {
				res.end('200');
			}

			if (req.method === 'POST') {
				let body = '';
				req.on('data', chunk => {
					body += chunk.toString(); // convert Buffer to string
				});
				req.on('end', () => {
					//암호화를 해서 들어온다면 로직 변경해야함
					var _packet = qs.parse(body);

					if (typeof _packet === "string" || _packet.api === undefined) {
						_packet = JSON.parse(body);
					}

					self.parser.onMessage(res, _packet);
				});
			}
		}
		catch (ex) {
			self.parser.onError(res, {}, ex);
		}
	}

	socketRequest(connection) {
		try {
			this.stats.allocate++;

			var req = connection.upgradeReq;
			connection.remoteAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

			connection._id = this.seqNo++;
			connection._create = new Date();
			connection._queue = [];
			connection._parent = this;
			connection._hb_error = 0;
			connection._heartbeat = new Date('2017-01-01');
			connection._last_check_queue = new Date();
			connection._last_check_session = new Date();
			this.clients[connection._id] = connection;

			connection._timeId = setTimeout(function () {
				try {
					if (connection) {
						global.warn('socket.error. peer:%s, error:__expired_login_time', connection.remoteAddress);
						connection.close();
					}
				} catch (ex) {
					global.warn(ex.stack);
				}
			}, 1000 * 60);

			connection.on('message', function (message, flag) {
				try {

					if (!connection) {
						global.warn('socket.error. err:__socket_closed, json:%s', message.toString());
						return;
					}
					var packet = {
						ts: new Date(),
						message: message.toString(),
						tid: null
					};

					packet.tid = null;

					connection._queue.push(packet);

					self.parser.emit('message', connection);

					//들어오는 암호화된 메시지 복호화
					//if (flag && flag.binary) {
					//	message = new Buffer(message).toString();
					//}
					//var decrypt = self.parser.decryption(new Buffer(message).toString());
					//zlib.unzip(new Buffer(decrypt, 'base64'), function (err: any, json: any) {
					//	try {
					//		if (err) throw err;

					//		if (!json)
					//			throw new Error('__update_app');

					//		if (!connection) {
					//			global.warn('socket.error. err:__socket_closed, json:%s', new Buffer(json).toString());
					//			return;
					//		}

					//		var packet = {
					//			ts: new Date(),
					//			message: new Buffer(json).toString(),
					//			tid: null
					//		};
					//		packet.tid = null;
					//		connection._queue.push(packet);

					//		self.parser.emit('message', connection);
					//	} catch (ex) {
					//		global.warn(ex);
					//		try { connection && connection.send(JSON.stringify({ result: '__update_app' })); } catch (ex) { }
					//	}
					//});
				} catch (ex) {
					try { connection && connection.send(JSON.stringify({ result: '__update_app' })); } catch (ex) { }
					global.warn(ex);
				}
			});

			connection.on('close', function (code) {
				try {
					if (!connection)
						return;

					this.stats.release++;

					connection.removeAllListeners();
					clearTimeout(connection._timeId);

					global.warn('socket.close. id:%s, peer:%s, code:%s', connection._uid || connection._id, connection.remoteAddress, code);

					if (connection.__session && connection.__session.uid) {
						delete global.users[connection.__session.uid];
					}

					delete this.clients[connection._id];
					connection = null;
				} catch (ex) {
					global.warn('socket.socketRequest.close ex:%s', ex.message);
				}
			});

			connection.on('error', function (err) {
				try {
					global.warn('socket.error. id:%s, peer:%s, error:%s', connection._id, connection.remoteAddress, err.message);
					//err.message != 'read ECONNRESET' && global.warn(err.stack);
					if (err.message === '__table_version' || err.message === '__expired_session' || err.message === '__expired_heart_beat') {
						setTimeout(function () {
							try {
								connection && connection.close();
							} catch (ex) {
								global.warn('socket.error.setTimeout. ex:%s', ex.message);
							}
						}, 2000);
						this.parser.sendWebSocket(connection, { api: '_session_notify', result: err.message });
					}
				} catch (ex) {
					global.warn(ex.stack);
				}
			});

			connection.resetHeartBeatTime = function () {

				clearTimeout(this._timeId);            // 제한 시간 타이머 해제

				this._timeId = setTimeout(function () {
					try {
						var time = new Date() - connection._lastMsg || 0;
						if (time > 5000)
							throw new Error('__expired_heart_beat');

						this._timeId = connection.resetHeartBeatTime();
					} catch (ex) {
						this.emit('error', ex);
					}
				}, global.heartBeatTime);
			}
		} catch (ex) {
			global.warn('socket.socketRequest. ex:%s', ex.message);
		}
	}

}

exports.createObject = function (portNum) {
	return new WebServer(portNum);
};