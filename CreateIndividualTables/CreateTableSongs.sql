CREATE TABLE `songs` (
  `timestamp` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `songid` varchar(75) NOT NULL,
  `songTitle` varchar(400) NOT NULL,
  `artist` varchar(400) DEFAULT NULL,
  `length` varchar(25) DEFAULT NULL,
  `genre` varchar(75) DEFAULT NULL,
  `userid` varchar(50) DEFAULT NULL,
  `username` varchar(75) DEFAULT NULL,
  `awesomes` int(11) DEFAULT NULL,
  `lames` int(11) DEFAULT NULL,
  `snags` int(11) DEFAULT NULL,
  KEY `songid` (`songid`)
)



