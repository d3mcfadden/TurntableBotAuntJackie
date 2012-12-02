CREATE TABLE `users` (
  `timestamp` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `userid` varchar(75) NOT NULL,
  `username` varchar(75) DEFAULT NULL,
  `created` varchar(75) DEFAULT NULL,
  `laptop` varchar(35) DEFAULT NULL,
  `acl` varchar(25) DEFAULT NULL,
  `fans` varchar(10) DEFAULT NULL,
  `points` varchar(10) DEFAULT NULL,
  `avatarid` varchar(4) DEFAULT NULL,
  PRIMARY KEY (`userid`)
)

