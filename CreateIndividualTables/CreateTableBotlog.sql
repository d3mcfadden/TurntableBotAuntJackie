CREATE TABLE `botlog` (
  `timestamp` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `userid` varchar(75) NOT NULL,
  `text` varchar(500) DEFAULT NULL,
  PRIMARY KEY (`timestamp`),
  KEY `userid` (`userid`)
)

