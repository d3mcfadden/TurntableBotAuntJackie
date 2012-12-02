CREATE TABLE `blacklist` (
  `timestamp` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `userid` varchar(75) NOT NULL,
  `username` varchar(75) NOT NULL,
  `reason` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`userid`)
)
