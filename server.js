// --------------------------------------

var express = require("express");
var app = express();

var server = require("http").createServer(app);
var io = require("socket.io")(server);

var bodyparser = require("body-parser");

var mysql = require("mysql");

var validator = require('validator');

// ---------------------------------------

var pool = mysql.createPool({
    host: "localhost",
    user: "root",
    password: "",
    database: "whello_server"
})

// ---------------------------------------

app.use(bodyparser.json());

app.use(bodyparser.urlencoded({"extended" : "true"}));

// ---------------------------------------

server.listen(7070, function(){

    console.log("-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-")
    console.log("Server running on port: 7070")

})

// ---------------------------------------

var socketUsers = {};

io.on("connection", function(socket){

    // ---------------------------------------------------------

    console.log("User connected: " + socket.id)

    socket.on("registerId", function(idToReg){

        socket["userid"] = idToReg;
        var id = "id_" + idToReg;

        socketUsers[id] = socket.id;

        console.log("The user is: " + socket["userid"])
        console.log(socketUsers)

    })

    // ---------------------------------------------------------

    socket.on("userProfileRequestFromClient", function(gotId){

        pool.getConnection(function(err, conn){

            var q = "SELECT name, dpurl, coverurl, hearts, views FROM users WHERE id='" + gotId + "'";

            conn.query(q, function(qerr, qres){

                console.log("Updated profile")

                if(qres.length != 1) return;
                var row = qres[0];

                socket.emit("userProfileResponseFromServer", row)

                conn.release();

            })

        })  

    })

    socket.on("userMLFirst10RequestFromClient", function(gotId){

        console.log(gotId);

        pool.getConnection(function(err, conn){

            var ml_table_name = "ml_" + gotId;
            var q = "SELECT users.id, users.name, users.dpurl, " + ml_table_name + ".last_sent_time, " + ml_table_name + ".last_msg, " + ml_table_name + ".seenbyuser FROM users, " + ml_table_name + " WHERE users.id = " + ml_table_name + ".rowId ORDER BY " + ml_table_name + ".last_sent_time DESC LIMIT 10";

            conn.query(q, function(qerr, qres){

                if(qres == 0 || qres == undefined){

                    socket.emit("userNoMLResponseFromServer");

                }else{

                    socket.emit("userMLFirst10ResponseFromServer", qres);

                }

            })

            conn.release();

        })

    })

    socket.on("loadMoreMLRequestFromClient", function(jsonObject){

        // TODO

    })

    socket.on("load10MessageWindowRowRequest", function(friendId){

        var userid = socket["userid"];

        if(userid < friendId){
            var message_table = "msg_" + userid + "_" + friendId;
        }else{
            var message_table = "msg_" + friendId + "_" + userid;
        }

        if(userid == undefined || friendId == undefined) return;

        pool.getConnection(function(err, conn){

            var q = "CREATE TABLE IF NOT EXISTS " + message_table + " LIKE msg_template";

            conn.query(q, function(err){

                if (err) throw err;

            })

            var q = "SELECT * FROM " + message_table;
            conn.query(q, function(err, qres){
                if(err) throw err;
                socket.emit("load10MessageWindowRowResponse", qres)

            })

            conn.release();

        })

    })

    socket.on("sendMessageToFriend", function(msgJson){

        var userid = socket["userid"];

        var msg = msgJson.msg;
        var friend_id = msgJson.friendID;

        if(userid < friend_id){
            var message_table = "msg_" + userid + "_" + friend_id;
        }else{
            var message_table = "msg_" + friend_id + "_" + userid;
        }

        pool.getConnection(function(err, conn){

            var q = "INSERT INTO `" + message_table +  "`(`msgFromId`, `msg`) VALUES (" + userid + ", '" + msg + "')";
            conn.query(q, function(err){

                if(err) throw err;

            })

            var q = "UPDATE ml_" + userid + " SET last_msg='" + msg + "', last_sent_time=NOW() WHERE rowId=" + friend_id;
            conn.query(q, function(err){

                if(err) throw err;

            })

            var q = "UPDATE ml_" + friend_id + " SET last_msg='" + msg + "', last_sent_time=NOW() WHERE rowId=" + userid;
            conn.query(q, function(err){

                if(err) throw err;

            })

            conn.release();

        })

    })

    socket.on("logoutRequest", function(){

        socket.emit("callForLogoutFromServer");

    })

    // ---------------------------------------------------------

    socket.on("disconnect", function(){

        delete socketUsers["id_" + socket["userid"]];

        console.log("User disconnected: " + socket.id);
        console.log(socketUsers)
        console.log("-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-")

    })

    // ---------------------------------------------------------

})

// -------------------------------------------------------------------------------------------------

app.get("/", function(req, res){

    res.send("<h2>Welcome to whello.com</h2> <p>Site under construction...</p>")

})

app.post("/auth/login", function(req, res){

    var login_email = req.body.login_email;
    var login_password = req.body.login_password;

    if(login_email == '' || login_password == '' || login_email == ' ' || login_password == ' ') return;

    pool.getConnection(function(err, conn){

        var q = "SELECT id, name, email FROM users WHERE BINARY email='" + login_email + "' AND BINARY password='" + login_password + "'";

        conn.query(q, function(qerr, qres){

            if(qres.length == 1){
            
                var row = qres[0];
                res.json({

                    "status" : 1,
                    "id": row.id,
                    "name" : row.name,
                    "email" : login_email,
                    "msg" : "Logging in.."

                })
                conn.release();

            }else{

                res.json({

                    "status" : 0,
                    "msg" : "Incorrect email, phone or password!"

                })
                conn.release();

            }

        })

    })

})

app.post("/auth/createaccount", function(req, res){

    var ca_fullname = req.body.ca_fullname.trim();
    var ca_email = req.body.ca_email.trim();
    var ca_password = req.body.ca_password.trim();

    if(ca_fullname.length < 5 || validator.isEmpty(ca_fullname)){

        res.send({

            "status" : 0,
            "msg" : "Please enter your full name"

        })

        return;

    }

    if(ca_email.length <5 || ca_password.length < 5){
        
        res.send({

            "status" : 0,
            "msg" : "E-mail or password is too short. Must be between 6 to 32 charecters"

        })

        return;
    };

    if(ca_email.length >65 || ca_password.length > 33){
        
        res.send({

            "status" : 0,
            "msg" : "E-mail or password is too long.  Must be between 6 to 32 charecters"

        })

        return;
    };

    if(!validator.isEmail(ca_email)){

        res.send({

            "status" : 0,
            "msg" : "Enter a proper e-mail"

        })

        return;

    }

    pool.getConnection(function(err, conn){

        var q1 = "SELECT name FROM `users` WHERE email='" + ca_email + "'";
        conn.query(q1, function(qerr, qres){

            if(qres.length != 0){

                res.send({

                    "status" : 0,
                    "msg" : "Email already taken, try another one"
        
                })

                conn.release();
                return;

            }else{

                var q2 = "INSERT INTO `users`(`name`, `email`, `password`) VALUES ('" + ca_fullname + "', '" + ca_email + "', '" + ca_password + "')";
                conn.query(q2, function(qerr, qres){

                    res.send({

                        "status" : 1,
                        "msg" : "Logging into new Account",
                        "id" : qres.insertId,
                        "name" : ca_fullname,
                        "email" : ca_email

                    })
                    conn.release();

                })

            }

        })
        

    })
      

})

// -------------------------------------------------------------------------------------------------


/*

POST REQUEST RESPONSE TMPLATE --

res.json({

    "status": 200,
    "id": id,

})

-----------------------------------------

*/
