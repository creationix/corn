var FS = require('fs');

var data = {
  title: "This is my title",
  delay: function(delay, message, callback) {
    setTimeout(function () {
      callback(null, "message");
    }, delay);
  },
  item: {title:"First",author:"Tim"},
  items: [
    {title:"First",author:"Tim"},
    {title:"Second",author:"Node"}
  ]
};

render("simple.html", data, function (err, result) {
  if (err) throw err;
  console.log(result);
});

///////////////////////////////////////////////////////////////////////////////

function render(filename, locals, callback) {
  FS.readFile(filename, "utf8", function (err, template) {
    if (err) return callback(err);
    compile(template, filename)(locals, callback);
  });
}

function compile(code, filename) {
  var tokens = tokenizer(code, filename);
  console.dir(tokens)
  return console.dir
  var length = tokens.length;
  return function (locals, callback) {
    var complete = 0;
    var parts = new Array(length);
    tokens.forEach(function (token, i) {
      if (typeof token === "string") {
        parts[i] = tokens[i];
        return;
      }

      // Load the value out of locals
      var name = token.name;
      if (!locals.hasOwnProperty(name)) {
        callback(new Error("Missing variable " + name));
        return;
      }
      var value = locals[name];
      
      if (token.content) {
        if (token.args) {
          throw new Error("TODO: Implement async sections");
        }
        var section = compile(token.content);
        if (Array.isArray(value)) {
          var left = value.length;
          var subParts = [];
          value.forEach(function (v, j) {
            section(v, function (err, result) {
              if (err) return callback(err);
              subParts[j] = result;
              left--;
              if (left === 0) {
                parts[i] = subParts.join("");
                check();
              }
            });
          });
          return;
        }
        if (value) {
          section(typeof value === "object" ? value : locals, function(err, result) {
            if (err) return callback(err);
            parts[i] = result;
            check();
          });
        }
      }
      
      // Async variable
      if (token.args) {
        if (typeof value !== "function") {
          callback(new Error("Variable " + name + " should be a function."))
          return;
        }
        var args = token.args.concat([function (err, result) {
          if (err) return callback(err);
          parts[i] = result;
          check();
        }]);
        if (value.length !== args.length) {
          callback(new Error("Function " + name + " should have " + token.args.length + " args and a callback"));
          return;
        }
        value.apply(locals, args);
        return;
      }
      
      // Normal variable
      parts[i] = value + "";

    });
    process.nextTick(check);
    
    function check() {
      for (var i = complete; parts[i]; i++) {}
      complete = i - 1;
      if (i === length) {
        callback(null, parts.join(""));
      }
    }
  }
}

// Matches all template tags
var tagRegex = /\{\{[#\/]?([a-z$_][a-z0-9$_]*(\.[a-z$_][a-z0-9$_]*)*)(\(([^\)]*)\))?\}\}/ig;

function getPosition(template, offset, filename) {
  var line = 0;
  var position = 0;
  var last = 0;
  for (var position = 0; position >= 0 && position < offset; position = template.indexOf("\n", position + 1)) {
    line++;
    last = position;
  }
  return "(" + filename + ":" + line + ":" + (offset - last) + ")";
}
function parseArgs(string) {
  var args = [];
  string.split(",").forEach(function (part) {
    part = part.trim();
    if (part) args.push(part);
  });
  return args;
}

function tokenizer(template, filename) {
  var parts = [];
  var position = 0;
  tagRegex.index = 0;
  var match;
  while (match = tagRegex.exec(template)) {
    var index = match.index;
    match = match[0];
    if (index > position) {
      var plain = template.substr(position, index - position);
      parts.push(plain);
    }
    position = index + match.length;
    var obj = {};
    if (match[2] === "#") {
      var end, name, args;
      if (match[match.length - 3] === ")") {
        var i = match.indexOf("(");
        obj.name = match.substr(3, i - 3);
        obj.args = parseArgs(match.substr(i + 1, match.length - i - 4));
      } else {
        obj.name = match.substr(3, match.length - 5);
      }
      var end = "{{/" + obj.name + "}}";
      var next = template.indexOf(end, position);
      if (next < 0) throw new Error("Missing closing " + end + " " + getPosition(template, position, filename));
      obj.content = template.substr(position, next - position);
      position = next + end.length;
    } else if (match[2] === "/") {
      throw new Error("Unexpected " + match + " " + getPosition(template, index, filename));
    } else {
      if (match[match.length - 3] === ")") {
        var i = match.indexOf("(");
        obj.name = match.substr(2, i - 2);
        obj.args = parseArgs(match.substr(i + 1, match.length - i - 4));
      } else {
        obj.name = match.substr(2, match.length - 4);
      }
    }
    parts.push(obj);
    tagRegex.lastIndex = position;
  }
  if (template.length > position) {
    var plain = template.substr(position);
    parts.push(plain);
  }
  return parts;
}