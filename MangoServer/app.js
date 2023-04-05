'use strict';

var util = require('util'),
    argv = require('optimist').argv,
    async = require('async'),
    redis = require('redis'),
    asyncRedis = require("async-redis"),
    property = require('./property'),
    crypto = require('crypto'),
    logger;

// �۷ι� �� �⺻ ��ü
global.base = this;

// �۷ι� ȯ�� ����
global.property = property;

argv.port = global.property.portNum;
global.procId = property.logger.category = util.format('app.%s', argv.port);

// �۷ι� ��ƿ��Ƽ ����
global.utils = require('./libs/app_utils');
global.query = require('./lib/app_query');

logger = require('./libs/app_logger').initLogger(property.logger);

// �α� �Լ� ����.
global.test = function () { logger.trace.apply(logger, arguments); };
global.action = function () { logger.action.apply(logger, arguments); };
global.debug = function () { logger.debug.apply(logger, arguments); };
global.warn = function () { logger.warn.apply(logger, arguments); };
global.error = function () { logger.error.apply(logger, arguments); };
global.fatal = function () { logger.fatal.apply(logger, arguments); };

global.base.mode = property.branch;

// MySQL
global.mysql = require('./libs/app_mysql').createObject(global.property.mysql);

global.apps = require('./libs/app_base').createObject(global.mysql);

global.server = require('./web_server').createObject(argv.port);