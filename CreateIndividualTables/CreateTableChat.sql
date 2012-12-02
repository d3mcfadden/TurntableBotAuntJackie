CREATE TABLE `chat` (
  `timestamp` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `userid` varchar(75) NOT NULL,
  `username` varchar(75) NOT NULL,
  `text` varchar(1000) DEFAULT NULL,
  KEY `timestamp` (`timestamp`),
  KEY `userid` (`userid`)
)

