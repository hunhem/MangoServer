'use strict';

var util = require('util');

class Account {
	constructor(parser) {
		this.parser = parser;
	}

	async account_get(body) {
		var self = this;
		var result = {};
		try {
			//account Á¶È¸
			var qry = {
				sql: global.query.account.selectAccountWhereUUID,
				data: [body.uuid]
			};
			var row = await global.mysql.asyncSelect(qry);
			if (row.length === 0)
				throw new Error('not exists user');

			result.uuid = row[0].uuid;
			result.device_id = row[0].device_id;

			return [null, result];
		}
		catch (ex) {
			return [ex, result];
		}
	}
}

exports.createObject = function (parser) {
	return new Account(parser);
};