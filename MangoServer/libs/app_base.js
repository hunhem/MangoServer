'use strict';

var util = require('util');

class AppBase {
    constructor(mysql) {
        var self = this;

        self.mysql = mysql;
        self.markets = {};
        self.maintenanceInfo = {};
        self.maintainAnnounce = {};
        self.maintainAnnounce.flag = 0;

        self.anc = { ridx: 0 };
	}

    async loadAppInfo () {
        try {

            global.debug('AppBase.loadAppInfo');

            var self = this,
                qryList = [
                    { sql: 'select * from app_base' }
                ];

            var results = await global.mysql.asyncSelect(qryList);
            var datas = {};
            results[0].forEach(function (row) {
                datas[row.market] = { current_version: row.current_version, limit_version: row.limit_version }
            });

            self.markets = datas;

            return result;

        } catch (ex) {
            return ex;
        }
    };

    getAppInfo (market) {
        var self = this,
            info;

        if (!(info = self.markets[market]))
            throw new Error('invalid_market');

        return info;
    };
}

exports.createObject = function (mysql) {
    return new AppBase(mysql);
};