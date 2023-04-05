'use strict';

var util = require('util'),
    os = require('os');
    //mkdirp = require('mkdirp'),
    //uuid = require('node-uuid'),
    //__ = require('underscore');

module.exports = {
   
    /** IP 정보 조회(private ip address 우선적으로 가져옮..) */
    getIPAddress: function () {
        var interfaces = require('os').networkInterfaces();
        var iList = [], keys, i, alias, ipAddr, prefix;

        keys = Object.keys(interfaces);
        keys.forEach(function (devName) {
            var iface = interfaces[devName];
            for (i = 0; i < iface.length; i++) {
                alias = iface[i];
                if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal)
                    iList.push(alias.address);
            }
        });

        if (iList.length > 0) {
            for (i = 0; i < iList.length; i++) {
                ipAddr = iList[i].split('.');
                prefix = parseInt(ipAddr[0]);
                if (prefix === 10 || prefix === 192 || prefix === 172)
                    return iList[i];
            }
            return iList[0];
        }

        throw new Error('not_existed_ipv4');
    },

    getNow: function () {
        if (arguments.length === 1 && typeof (arguments[0]) !== 'undefined') {
            return new Date(arguments[0]);
        } else if (arguments.length > 1) {
            return new Date(arguments[0] || 0, arguments[1] || 0, arguments[2] || 0, arguments[3] || 0, arguments[4] || 0, arguments[5] || 0, arguments[6] || 0);
        } else {
            if (this.devMode) {
                return new Date();
                //var now = new Date();
                //now.setDate(now.getDate() + 5);
                //now.setHours(now.getHours() + 4);
                //return now;
            } else {
                return new Date();
            }
        }
    },

    pad2: function (number) {
        return (number < 10 ? '0' : '') + number;
    },

    pad3: function (number) {
        if (number < 10)
            return '00' + number;
        if (number < 100)
            return '0' + number;
        return '' + number;
    },

    toDateFmt: function (format, date) {
        var self = this;
        typeof (date) === 'string' && (date = new Date(date));
        var vDay = self.pad2(date.getDate());
        var vMonth = self.pad2(date.getMonth() + 1);
        var vYearLong = self.pad2(date.getFullYear());
        var vYearShort = self.pad2(date.getFullYear().toString().substring(2, 4));
        var vYear = (format.indexOf('YYYY') > -1 ? vYearLong : vYearShort);
        var vHour = self.pad2(date.getHours());
        var vMinute = self.pad2(date.getMinutes());
        var vSecond = self.pad2(date.getSeconds());
        return format
            .replace(/DD/g, vDay)
            .replace(/MM/g, vMonth)
            .replace(/Y{1,4}/g, vYear)
            .replace(/HH/g, vHour)
            .replace(/MI/g, vMinute)
            .replace(/SS/g, vSecond);
        //.replace(/SSS/g, vMillisecond)
    },
};