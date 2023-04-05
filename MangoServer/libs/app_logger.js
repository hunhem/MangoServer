'use strict';

var util = require('util'),
    fs = require('fs'),
    zlib = require('zlib'),
    async = require('async'),
    path = require('path'),
    //AWS = require('aws-sdk'),
    //__ = require('underscore'),
    os = require('os'),
    dgram = require('dgram');

class AppLogger {
	constructor(cfg) {
        global.utils || (global.utils = require('./app_utils'));

        cfg || (cfg = {});
        var self = this;

        self.eLEVEL = {
            TRACE: 1,
            DEBUG: 2,
            ACT: 3,
            WARN: 4,
            ERROR: 5,
            FATAL: 6
        };

        self.pLEVEL = {
            1: 'TRACE',
            2: 'DEBUG',
            3: 'ACT',
            4: 'WARN',
            5: 'ERROR',
            6: 'FATAL'
        };

        self.eCOLOR = {
            TRACE: '\x1b[37m%s\x1b[0m',
            DEBUG: '\x1b[37m%s\x1b[0m',
            ACT: '\x1b[36m%s\x1b[0m',
            WARN: '\x1b[33m%s\x1b[0m',
            ERROR: '\x1b[31m%s\x1b[0m',
            FATAL: '\x1b[31m%s\x1b[0m'
        };

        self.iLevel = cfg.iLevel || 1;
        self.sep = '/';

        //if (!cfg.logDir && os.platform() === 'win32') {
        //    self.logDir = os.tmpdir();
        //} else {
        //    self.logDir = cfg.logDir || '/tmp';
        //}

        self.logDir = 'logs';

        self.category = cfg.category || 'test';
        self.domain = self.category.split('.')[0];
        self.fileMaxSize = cfg.fileMaxSize || 1024 * 1024 * 40;     // 40M
        self.format = cfg.format || 'YYMMDDHH';
        self.backups = cfg.backups || 5;
        self.stdout = cfg.stdout;
        self.ignoreDB = cfg.ignoreDB;
        self.rotationMin = cfg.rotationMin || 10;                   // 60 단위로 파일 생성..
        self.files = {};
        self.name = util.format('%s%s%s.log', self.logDir, path.sep, self.category);
        self.ipAddr = global.utils.getIPAddress();

        //if (cfg.aws) {
        //    AWS.config.update(cfg.aws);
        //    self.s3 = new AWS.S3();
        //    self.bucket = cfg.aws.bucket;
        //}

        if (cfg.proxy) {
            self.proxy = {
                cli: dgram.createSocket("udp4"),
                host: cfg.proxy.host
            };
            self.proxy.num = cfg.proxy.udps.length;
            self.proxy.seq = 0;
            self.proxy.udps = cfg.proxy.udps;
            self.proxy.getPortNo = function () {
                var that = this;
                that.seq === Number.MAX_VALUE && (that.seq = 0);
                return that.udps[that.seq++ % that.num];
            }
        }
    }

    /** */
    trace () {
        var self = this;

        if (self.eLEVEL.TRACE < self.iLevel)
            return;

        self.writeLog(self.eLEVEL.TRACE, arguments);
    };


    /** */
    debug () {
        var self = this;

        if (self.eLEVEL.DEBUG < self.iLevel)
            return;

        self.writeLog(self.eLEVEL.DEBUG, arguments);
    };


    /** */
    action (obj) {
        var self = this;

        self.writeLog(self.eLEVEL.ACT, [JSON.stringify(obj)]);
    };


    /** */
    warn () {
        var self = this;

        if (self.eLEVEL.WARN < self.iLevel)
            return;

        self.writeLog(self.eLEVEL.WARN, arguments);
    };


    /** */
    error () {
        var self = this;

        if (self.eLEVEL.ERROR < self.iLevel)
            return;

        self.writeLog(self.eLEVEL.ERROR, arguments);
    };


    /** */
    fatal () {
        var self = this;

        if (self.eLEVEL.FATAL < self.iLevel)
            return;

        self.writeLog(self.eLEVEL.FATAL, arguments);
    };


    /** */
    writeLog (level, argv) {
        var self = this,
            iLevel = self.pLEVEL[level],
            msg = util.format('%s [%s] %s - %s', self.timestamp(), iLevel, self.category, util.format.apply(null, argv)),
            data, buff;

        self.stdout && console.log(self.eCOLOR[iLevel], msg);

        msg += '\n';
        self.checkRotation(function () {
            self.files.size += msg.length;
            fs.write(self.files.fd, msg, function (err) {
                err && console.error(err.message);
            });
        });

        if (level >= self.eLEVEL.INFO && self.proxy) {
            data = {
                ipAddr: self.ipAddr,
                msg: msg.trim()
            };
            //buff = new Buffer(JSON.stringify(data));
            buff = Buffer.from(JSON.stringify(data));
            self.proxy.cli.send(buff, 0, buff.length, self.proxy.getPortNo(), self.proxy.host, function () { });
        }
    };


    /** */
    timestamp () {
        var now = global.utils.getNow();

        return '[' + global.utils.pad2(now.getMonth() + 1) + '-' + global.utils.pad2(now.getDate()) + ' ' +
            global.utils.pad2(now.getHours()) + ':' + global.utils.pad2(now.getMinutes()) + ':' +
            global.utils.pad2(now.getSeconds()) + '.' + global.utils.pad3(now.getMilliseconds()) + ']';
    };


    /** */
    checkRotation (cb) {
        var self = this,
            now = global.utils.getNow();
        try {
            // 현재 로그 파일 유효성 검사
            if (self.files.next && now < self.files.next && self.files.size < self.fileMaxSize)
                return cb(null);

            if (cb) {
                if (self.waitList) {
                    self.waitList.push(cb);
                    return;
                }
                self.waitList = [cb];
            }

            async.series([
                function (next) { self.closeLog(next); },
                function (next) { self.openLog(next); }
            ], function (err) {
                self.waitList.forEach(function (next) { next(err); });
                self.waitList = null;
            });
        } catch (ex) {
            if (self.waitList) {
                self.waitList.forEach(function (next) { next(ex); });
                self.waitList = null;
            }
        }
    };


    /** */
    closeLog (cb) {
        try {
            var self = this;

            if (!self.files.fd)
                return cb(null);

            fs.close(self.files.fd, function (err) {
                try {
                    if (err) throw err;

                    self.files.fd = 0;

                    var moveTo = util.format('%s%s%s_%s.log', self.logDir, path.sep, self.category, global.utils.toDateFmt('YYMMDDHHMISS', self.files.createDate));
                    fs.rename(self.name, moveTo, function (err) {
                        try {
                            cb(err);

                            var createDate = global.utils.getNow(self.files.createDate);
                            //self.s3 && process.nextTick(function () { self.uploadS3(moveTo, createDate) });
                        } catch (ex) {
                            cb(ex);
                        }
                    });
                } catch (ex) {
                    cb(ex);
                }
            });
        } catch (ex) {
            cb(ex);
        }
    };


    /** */
    openLog(cb) {
        try {
            var self = this,
                std = global.utils.getNow(),
                next;

            std.setMinutes(std.getMinutes() - (std.getMinutes() % self.rotationMin));
            std.setSeconds(0);
            std.setMilliseconds(0);

            next = global.utils.getNow(std);
            next.setMinutes(next.getMinutes() + self.rotationMin);

            fs.stat(self.name, function (err, stats) {
                try {
                    if (err) {
                        self.files.size = 0;
                        self.files.createDate = global.utils.getNow();
                    } else {
                        self.files.size = stats.size;
                        self.files.createDate = global.utils.getNow(stats.birthtime);
                        if (self.files.createDate < std) {
                            // 생성된 시간이 새로 생성될 기준 시간보다 먼저 만들어진 경우, 백업 후 새로운 파일 생성..
                            self.files.fd = fs.openSync(self.name, 'a+');
                            self.checkRotation(null);
                            return;
                        }
                    }
                    self.files.fd = fs.openSync(self.name, 'a+');
                    self.files.next = next;

                    self.files.tid && clearTimeout(self.files.tid);
                    self.files.tid = setTimeout(function () {
                        self.files.tid = 0;
                        self.checkRotation(function () { });
                    }, self.files.next - global.utils.getNow() + 5000);     // 로그 입력이 없을 경우, 자동으로 현재 로그 파일을 S3로 백업 후 새로운 로그 파일 생성..

                    cb(null);

                    self.backups && process.nextTick(function () { self.checkBackups() });
                } catch (ex) {
                    cb(ex);
                }
            });
        } catch (ex) {
            cb(ex);
        }
    };


    /** */
    checkBackups() {
        try {
            var self = this;

            fs.readdir(self.logDir, function (err, files) {
                try {
                    if (err) throw err;
                    var iAry = [],
                        iList;
                    files.forEach(function (name) {
                        if (name.indexOf(self.category) !== 0 || self.name.indexOf(name) >= 0)
                            return;
                        iAry.push(name);
                    });
                    if (iAry.length < self.backups)
                        return;

                    iAry.sort();
                    iList = iAry.splice(0, iAry.length - self.backups);
                    async.each(iList, function (name, next) {
                        var target = util.format('%s%s%s', self.logDir, path.sep, name);
                        global.debug('AppLogger.checkBackups. unlink:%s', target);
                        fs.unlink(target, next);
                        /*
                                                global.mysql.select('select count(1) as cnt from T_LOG_HISTORY where local = ?', [target], function(err, rows) {
                                                    try {
                                                        if (err) throw err;
                        
                                                        if (rows[0].cnt > 0)
                                                            fs.unlink(target, next);
                                                        else {
                                                            var pDate = name.split('_')[1].split('.')[0],
                                                                date = new Date(util.format('20%s-%s-%s %s:%s:%s',
                                                                    pDate.substring(0, 2), pDate.substring(2, 4), pDate.substring(4, 6),
                                                                    pDate.substring(6, 8), pDate.substring(8, 10), pDate.substring(10, 12)
                                                                ));
                                                            self.uploadS3(target, date);
                                                            next(null);
                                                        }
                                                    } catch (ex) {
                                                        next(ex);
                                                    }
                                                });
                        */
                    })
                } catch (ex) {
                    console.error('AppLogger.checkBackups.readdir. ex:%s', ex.message);
                }
            });
        } catch (ex) {
            console.error('AppLogger.checkBackups. ex:%s', ex.message);
        }
    };


    /** */
    uploadS3(target, date) {
        try {
            var self = this,
                key = util.format('%s/SYS/%s/%s/%s_%s_%s.log',
                    global.base.mode || 'live',
                    global.utils.toDateFmt('YYMMDD', date),
                    self.domain,
                    self.category,
                    global.utils.toDateFmt('HHMISS', date),
                    self.ipAddr
                );

            self.s3.putObject({
                Bucket: self.bucket,
                Key: key,
                Body: fs.createReadStream(target),
                ACL: 'private'
            }, function (err) {
                try {
                    if (err) throw err;

                    console.log('AppLogger.uploadS3. %s->%s %s', target, key, self.bucket);

                    global.mysql.execute({
                        sql: 'INSERT INTO T_LOG_HISTORY SET ?',
                        data: {
                            uri: key,
                            date: global.utils.toDateTime(),
                            state: self.ignoreDB ? 9 : 1,
                            begin: '2017-01-01',
                            local: target
                        }
                    }, function () {
                        console.log('success insert to T_LOG_ARRANGE_HISTORY')
                    });

                    global.mysql.execute({
                        sql: 'INSERT INTO T_LOG_ARRANGE_HISTORY SET ?',
                        data: {
                            uri: key,
                            date: global.utils.toDateTime(),
                            state: self.ignoreDB ? 9 : 1
                        }
                    }, function () {
                        console.log('success insert to T_LOG_ARRANGE_HISTORY')
                    });

                } catch (ex) {
                    console.error('[er] AppLogger.uploadS3. %s->%s, %s, ex:%s', target, key, self.bucket, ex.message);

                    //ex.stack && console.error(ex.stack);

                    setTimeout(function () {
                        process.nextTick(function () { self.uploadS3(target, date) });
                    }, 3000);
                }
            });
        } catch (ex) {
            console.error('AppLogger.uploadS3. ex:%s', ex.message);
        }
    };
}

exports.initLogger = function (cfg) {
    return new AppLogger(cfg);
};
