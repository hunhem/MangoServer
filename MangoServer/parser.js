'use strict';

var util = require('util'),
    events = require('events'),
    crypto = require('crypto'),
    zlib = require('zlib'),
    cmds = require('./commands');

class Parser {

    constructor() {

        var self = this;
        self.apis = {}; //< 외부 호출 API 정보.
        Object.keys(cmds).forEach(function (domain) {
            self[domain] = require(util.format('./api/%s', domain)).createObject(self);
            cmds[domain].forEach(function (api) {
                self.apis[api] = domain;
            });
        });

        self.crytoIv = new Buffer('00000000000000000000000000000000', 'hex');
        self.crytoKey = new Buffer('00000000000000000000000000000000', 'hex');
    }

    encryption(input) {
        var self = this,
            cipher, buf, encrypted;
        try {
            cipher = crypto.createCipheriv('aes-128-cbc', self.crytoKey, self.crytoIv);
            encrypted = cipher.update(input, 'utf-8');
            buf = Buffer.concat([encrypted, cipher.final()]);
            return buf.toString('base64');
        } catch (ex) {
            global.warn('encryption error:%s', ex.message);
            return undefined;
        }
    };

    decryption(encrypted) {
        var self = this,
            decipher, decrypted;
        try {
            decipher = crypto.createDecipheriv('aes-128-cbc', self.crytoKey, self.crytoIv);
            decrypted = decipher.update(encrypted, 'base64', 'utf-8');
            decrypted += decipher.final('utf8');
            return decrypted;
        } catch (ex) {
            global.warn('decryption error:%s', ex.message);
            return undefined;
        }
    };

    getProtocol(body) {
        try {
            console.log(body);
        } catch (ex) {
            console.log(body);
        }
    };

    async onMessage(res, body) {
        var self = this,
            result = {},
            err,
            t1, packet;
        try {
            //body = this.decryption(body);
            //var protocol = JSON.parse(body);
            var protocol = body;
            var domain = self.apis[protocol.api];
            var api = self[domain][protocol.api];

            if (!domain)
                throw new Error('unregistered_api');

            var requestTime = new Date();

            [err, result] = await api.call(self[domain], protocol);
            result.api = protocol.api;
            result.requestTime = requestTime;
            result.responseTime = new Date();

            global.debug('Parser.onMessage. api:%s, result:%s', protocol.api, result);

            if (err) throw err;

            result.successed = true;
            self.sendHttps(res, result);

            //api.call(self[domain], protocol, function (err, result) {
            //    try {
            //        send_result = result;
            //        send_result.api = protocol.api;
            //        send_result.requestTime = requestTime;
            //        send_result.responseTime = new Date();

            //        global.debug('Parser.onMessage. api:%s, requestTime:%s', protocol.api, requestTime);

            //        if (err) throw err;

            //        send_result.successed = true;
            //        self.sendHttps(res, send_result);
            //    }
            //    catch (ex) {
            //        self.onError(res, send_result, ex);
            //    }
            //});

        }
        catch (ex) {
            self.onError(res, send_result, ex);
        }
    };

    async sendHttps(res, result) {
        try {
            res.end(JSON.stringify(result));
        }
        catch (ex) {
            global.warn('Parser.sendHttps. ex:%s', ex.message || ex);
            ex.stack && global.warn(ex.stack);
        }
    };

    async onError(res, result, ex) {
        var self = this;
        try {
            global.warn(ex.stack || ex);
            if (ex === null || ex === undefined) ex = new Error('unknown_error');
            //ex.message || (ex = new Error('__unknown_error'));

            result.successed = false;
            result.message = ex.message;

            self.sendHttps(res, result);

            global.warn('Parser.onError. api:%s, ex:%s', result.api, ex.message);
        }
        catch (ex) {
            result.message = ex.message;
            self.sendHttps(res, result);
        }
    }
    
}

exports.createParser = function () {
    return new Parser();
};