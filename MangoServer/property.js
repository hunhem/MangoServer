module.exports = {
    option: {
        local: {
            key: 'local.key.pem',
            cert: 'local.cert.pem'
        },
        dev: {
        },
        live: {
        }
    },

    tbl_bucket: 'tbl',
    log_bucket: 'logs',
    jandiwh: 'https://wh.jandi.com/connect-api/webhook/11349009/2784826cdeea9ca5b75662932965953b',
    portNum: 4200,
    cdn: 'https://d1kujer6pqjfdk.cloudfront.net',
    akamai_cdn: 'https://idiocracy-dl.akamaized.net/boh',			//akamai
    //cdn2: 'https://idio-cdn001-1300941556.file.myqcloud.com',
    //cdn3: 'https://idio-cdn002-1300941556.file.myqcloud.com',
    tbl: {
        aes: {
            key: '1DA1877A68385A18CC62F07B07909F0A',
            iv: 'AB3942D1FA24FE25734B2955D4DC6556'
        }
    },
    aws: {
        accessKeyId: 'AKIAVEATNQ7YAYZ2D6RW',
        secretAccessKey: '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',
        signatureVersion: 'v4'
    },
    branch: 'local',
    mysql: {
        master: {
            host: 'localhost',
            port: 3306,
            user: 'test',
            password: 'test',
            database: 'test_game',
            connectionLimit: 200
        },
        slave: []
    },
    advlogdb: {
        master: {
            host: 'localhost',
            port: 3306,
            user: 'test',
            password: 'test',
            database: 'test_log',
            connectionLimit: 200
        },
        slave: []
    },
    logger: {
        stdout: 1
    },
    redis: {
        session: {
            host: 'localhost',
            port: 6379
        },
        subs: {
            host: 'localhost',
            port: 6379
        },
        pvp: {
            host: 'localhost',
            port: 6379
        },
        ranking: {
            host: 'localhost',
            db: 2,
            port: 6379
        },
    },
    session: {
        key: 'test',     // 암호키값
        ttl: 60 * 60 * 24 * 2 
    },
    elasticsearch: {
        host: "https://search-tb-logs-ezobovkia2fnzl7ql6jbfech3a.ap-northeast-2.es.amazonaws.com",
        useStages: ['test'],
        aws: {
            accessKeyId: 'test',
            secretAccessKey: 'test',
            region: 'ap-northeast-2'
        },
    },
    fcm: 'test',
    heartBeat: 90 * 1000,
    timeZone: 9
};
