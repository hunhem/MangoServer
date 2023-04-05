'use strict';

module.exports = {
    account: {
        selectAccountWhereUUID: "select * from `account` where `uuid` = ?",
        insertAccount: "insert into account set ?",
    },

    auth: {
        selectAuthDeviceWhereDeviceID: "select `uuid` from `auth_device` where `device_id` = ?",
        insertAuthDevice: "insert into `auth_device` set ?",
    },

    table: {
        
    }
}