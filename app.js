var express = require('express');
var app = express();
var server = require('http').createServer(app);
var socketio = require('socket.io');
var io =  socketio.listen(server);

app.get('/',function(req, res){
  res.sendFile(__dirname + '/client/index.html')
});

app.use('/client',express.static(__dirname + '/client'));

server.listen(2000);
console.log('server listening on 2000');

var SOCKET_LISTS = {};

var Entity = function (){
    var self = {
        x:250,
        y:250,
        spdX:0,
        spdY:0,
        id:"",
    };

    self.update = function(){
        self.updatePosition();
    }
    self.updatePosition = function(){
        self.x += self.spdX;
        self.y += self.spdY;
    }

    self.getDistance = function(pt){
        return Math.sqrt(Math.pow(self.x-pt.x, 2) +  Math.pow(self.y-pt.y, 2));
    }

    return self;
}

var Player = function(id){
    var self = Entity();
    self.id = id;
    self.number = "" + Math.floor(10 * Math.random());
    self.pressingRight = false;
    self.pressingLeft = false;
    self.pressingUp = false;
    self.pressingDown = false;
    self.pressingAttack = false;
    self.pressingAngle = 0;
    self.maxSpd = 10;

    var super_update = self.update;
    self.update = function(){
        self.updateSpd();
        super_update();

        if(self.pressingAttack){
          self.shootBullet(self.mouseAngle);
        }
    }

    self.shootBullet = function(angle){
        var b = Bullet(self.id, angle);
        b.x = self.x;
        b.y = self.y;
    }

    self.updateSpd = function(){
        if(self.pressingRight)
          self.spdX = self.maxSpd;
        else if(self.pressingLeft)
          self.spdX = -self.maxSpd;
        else
          self.spdX = 0;

        if(self.pressingUp)
          self.spdY = -self.maxSpd;
        else if(self.pressingDown)
          self.spdY = self.maxSpd;
        else
          self.spdY = 0;
    }

    Player.list[id] = self;
    return self;
}

Player.list = {};

Player.onConnect = function(socket){
  var player = Player(socket.id);
    socket.on('keyPress',function(data){
      if(data.inputId === 'left')
        player.pressingLeft = data.state;
      else if(data.inputId === 'right')
        player.pressingRight = data.state;
      else if(data.inputId === 'up')
        player.pressingUp = data.state;
      else if(data.inputId === 'down')
        player.pressingDown = data.state;
      else if(data.inputId === 'attack')
        player.pressingAttack = data.state;
      else if(data.inputId === 'mouseAngle')
        player.mouseAngle = data.state;
    });
}

Player.update = function(){
  var pack = [];
  for(var i in Player.list){
    var player = Player.list[i];
    player.update();
    pack.push({
      x:player.x,
      y:player.y,
      number: player.number
    });
  }
  return pack;
}


Player.onDisconnect = function(socket) {
  delete Player.list[socket.id];
}

var Bullet = function(parent, angle){
    var self = Entity();
    self.id  = Math.random();
    self.spdX = Math.cos(angle/180 * Math.PI) * 10;
    self.spdY = Math.sin(angle/180 * Math.PI) * 10;
    self.parent = parent;
    self.timer = 0;
    self.toRemove = false;
    var super_update  = self.update;
    self.update = function(){
        if(self.timer++ > 100){
          self.toRemove = true;
        }
        super_update();
        for(var i in Player.list){
          var p = Player.list[i];
            if(self.getDistance(p) < 32 && self.parent !==p.id){
                self.toRemove = true;
            }
        }
    }
    Bullet.list[self.id] = self;
    return self;
}
Bullet.list = {};


Bullet.update = function(){
    var pack = [];
    for(var i in Bullet.list){
      var bullet = Bullet.list[i];
      bullet.update();

      if(bullet.toRemove){
          delete Bullet.list[i];
      }
      else
          pack.push({
            x:bullet.x,
            y:bullet.y,
          });
    }
    return pack;
}


io.on('connection',function(socket){
    socket.id = Math.random();
    SOCKET_LISTS[socket.id] = socket;

    Player.onConnect(socket);

    socket.on('disconnect',function(){
      delete SOCKET_LISTS[socket.id];
      Player.onDisconnect(socket);
    });

    var playerName = ("" + socket.id).slice(2,7);

    socket.on('sendMsgToServer',function(data){
      for(var i in SOCKET_LISTS){
        var socket = SOCKET_LISTS[i]
        socket.emit('addToChat',playerName + ':' + data);
      }
    });

});

setInterval(function(){
    var pack ={
      player: Player.update(),
      bullet: Bullet.update()
    }
    for(var i in SOCKET_LISTS){
      var socket = SOCKET_LISTS[i]
      socket.emit('newPositions', pack);
    }
}, 1000/25);
