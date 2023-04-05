'use strict';

var util = require('util');
var node_uuid = require('node-uuid');

class Auth {
	constructor(parser) {
		this.parser = parser;
	}

	async client_login(body) {
		var self = this;
		var result = {};
		try {
			var uuid = null;
			var apps = global.apps.getAppInfo(body.market);
			//앱버전검사
			if (body.app_version < apps.limit_version) {
				return [new Error('force_update'), result];
			}

			if (body.app_version > apps.current_version) {
				return [new Error('invalid_client_version'), result];
			}

			//device 조회
			var qry = {
				sql: global.query.auth.selectAuthDeviceWhereDeviceID,
				data: [body.device_id]
			};
			var row = await global.mysql.asyncSelect(qry);

			//없으면 계정 생성
			if (row.length === 0)
				uuid = await self.create_user(body.device_id, body.market);
			else
				uuid = row[0].uuid;

			result.uuid = uuid;

			return [null, result];
			//return cb(null, result);
		}
		catch (ex) {
			return [ex, result];
			//return cb(ex, result);
		}
	}

	async create_user(device_id, market) {
		var self = this;
		var uuid = node_uuid.v1();
		try {
			var qry = {
				sql: global.query.auth.insertAuthDevice,
				data: { uuid: uuid, device_id: device_id, market: market }
			};
			await global.mysql.asyncExecute(qry);

			var account = { uuid: uuid, device_id: device_id, market: market };
			qry = {
				sql: global.query.account.insertAccount,
				data: account
			};

			await global.mysql.asyncExecute(qry);

			return uuid;

		}
		catch (ex) {
			return ex;
		}
	}

	async get_account(uuid) {
	}
}

exports.createObject = function (parser) {
	return new Auth(parser);
};