'use strict';

var async = require('async'),
    mysql = require('mysql'),
    util = require('util'),
    //iObj = require('./app_mysql_obj'),
    __ = require('underscore');

class AppMysql {
    constructor(property) {
        var self = this;
        self.property = {};
        self.readDB = 'MASTER';
        self.retry = 0;

        self.expiredTime = 3000;

        if (property) {
            self.pool = mysql.createPoolCluster({ removeNodeErrorCount: 5, defaultSelector: 'ORDER' });
            if (typeof (property.master) === 'object') {
                self.property['MASTER'] = property.master;
            } else {
                self.property['MASTER'] = property;
            }
            property.slave && property.slave.forEach(function (cfg, pos) {
                var name = util.format('SLAVE%s', pos + 1);
                self.property[name] = cfg;
                self.readDB = 'SLAVE*';
            });

            Object.keys(self.property).forEach(function (key) {
                self.pool.add(key, self.property[key]);
            });
            
            self.pool.on('remove', function (key) {
                global.warn('AppMysqlQuery. REMOVED NODE : %s, retry:%s', key, ++self.retry);
                if (self.retry > 20) {
                    setTimeout(function () {
                        process.exit(-1);
                    }, 2000);
                    return;
                }
                setTimeout(function () {
                    self.pool.add(key, self.property[key]);
                }, 1000);
            });
        }
    }

    /** MySQL 연결 정보 설정.. */
    setConnection (pool) {
        var self = this;
        self.bCreate = false;
        self.pool = pool;
    };


    /**  */
    close () {
        var self = this;

        self.pool.end(function (err) {
            err && global.error('AppMysqlQuery.close. err:%s', err.message);
        });
    };


    /** 스키마 정보 설정 */
    init (info) {
        var self = this;
        try {
            if (info.domain) {
                self.domain = info.domain;
                self.tables = info.tables;
            } else {
                self.tables = info;
            }
            if (self.tables.length > 0) {
                self.key = self.tables[0].key;
                self.names = [];
                self.tables.forEach(function (item) {
                    self.names.push(item.table);
                })
            }
            self.object = iObj.createObject(self);
        } catch (ex) {
            global.error('TableSchemaMgr.init. error:%s', ex.message);
            global.warn(ex.stack);
        }
    };


    /** 고유 키 별 데이터 관리 객체 가져오기... */
    get (key, cb) {
        var self = this;

        try {
            if (typeof (key) === 'undefined')
                throw new Error('__invalid_param');

            var tid = setTimeout(function () {
                //global.base.sendErrorHistory(new Error('__expired_db_time'), {domain : self.domain, key : key}, 'mysql.get');
            }, self.expiredTime);

            // Table object
            self.object.get(key, null, function () {
                clearTimeout(tid);
                cb.apply(self, arguments);
            })
        } catch (ex) {
            cb(ex);
        }
    };


    /** DB 쿼리 실행 - 읽기 전용 */
    select () {
        var self = this,
            qry, clusterId, cb;

        if (arguments.length === 3) {
            qry = arguments[0];
            clusterId = arguments[1];
            cb = arguments[2]
        } else {
            qry = arguments[0];
            clusterId = self.readDB;
            cb = arguments[1];
        }

        try {
            var bArray = util.isArray(qry);
            self.pool.getConnection(clusterId, function (err, client) {
                try {
                    if (err) {
                        return cb(err);
                    }

                    // issue 19-07-31 강명규 성능개선이 필요해보인다... mysql repeatable-read 는 아주아주 느리고 문제가 많다~
                    //  아래 tx level 조절 구문 제거하고 mysql 을 binlogformat = row 에 tx_level 디폴트를 read-commit 으로 변경해야함
                    clusterId = client._clusterId;
                    var qryList = bArray ? qry : [qry];
                    qryList.splice(0, 0, 'SET SESSION TRANSACTION ISOLATION LEVEL READ UNCOMMITTED ;');
                    qryList.push('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED ;');
                    async.mapSeries(qryList, function (qry, callback) {
                        typeof (qry) === 'string' ? client.query(qry, callback) : client.query(qry.sql, qry.data, callback);
                    }, function (err, results) {
                        try {
                            if (err) throw err;
                            client.release();

                            results.splice(0, 1);
                            results.splice(results.length - 1, 1);

                            try {
                                cb(err, bArray ? results : results[0], clusterId);
                            } catch (ex) {
                                global.warn(ex.stack);
                            }
                        } catch (ex) {
                            cb(ex);
                            global.warn(qry);
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


    /** 쓰기 읽기 모두 가능 - Master DB 에서만 동작. */
    // 모든 쿼리는 이걸로 발생한다?
    execute (qry, cb) {
        var self = this;

        try {
            var qryList = util.isArray(qry) ? qry : [qry],
                _begin;
            if (qryList.length < 1)
                return cb(null);

            _begin = new Date();
            self.pool.getConnection('MASTER', function (err, client) {
                try {
                    if (err) throw err;

                    client.beginTransaction(function (err) {
                        try {
                            if (err) throw err;
                            async.mapSeries(qryList, function (_qry, callback) {
                                var t = new Date();
                                if (!_qry || !_qry.sql) {
                                    global.warn(qryList);
                                    throw new Error('__mysql_empty_query');
                                }
                                client.query(_qry.sql, _qry.data || [], function (err, ret) {
                                    try {
                                        if (err) throw err;
                                        if (_begin) {
                                            _qry._ts = new Date() - _begin;
                                            _begin = 0;
                                        }
                                        _qry._t = new Date() - t;
                                        callback(err, ret);
                                    } catch (ex) {
                                        global.warn(ex.stack);
                                        global.warn(_qry);
                                        callback(ex);
                                    }
                                });
                            }, function (err, results) {
                                _begin = new Date();
                                self.releaseTrans(client, err, function (err) {
                                    qryList[0]._tc = new Date() - _begin;
                                    try {
                                        cb(err, results);
                                    } catch (ex) {
                                        global.error(qry);
                                        global.error(ex);
                                    }
                                });
                            });
                        } catch (ex) {
                            self.releaseTrans(client, ex, cb);
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
    releaseTrans (client, err, cb) {
        try {
            if (err) throw err;

            client.commit(function (err) {
                if (err) {
                    client.rollback(function () {
                        client.release();
                        cb(err);
                    });
                } else {
                    client.release();
                    cb(null);
                }
            })
        } catch (ex) {
            client.rollback(function () {
                client.release();
                cb(ex);
            });
        }
    };

    asyncExecute (qry) {
        return new Promise((resolve, reject) => {
            global.mysql.execute(qry, (error) => {
                try {
                    if (error) throw error;
                    return resolve();
                } catch (ex) {
                    return reject(ex);
                }
            });
        }).then((rows) => {
            return rows;
        }).catch((ex) => {
            throw ex;
        });
    }

    asyncSelect (query) {
        return new Promise((resolve, reject) => {
            global.mysql.select(query, (error, rows) => {
                try {
                    if (error) throw error;
                    return resolve(rows);
                } catch (ex) {
                    return reject(ex);
                }
            });
        }).then((rows) => {
            return rows;
        }).catch((ex) => {
            throw ex;
        });
    }

}

exports.createObject = function (property) {
    return new AppMysql(property);
};
