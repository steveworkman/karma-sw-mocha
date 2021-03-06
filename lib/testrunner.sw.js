self.window = self;

importScripts('/base/node_modules/mocha/mocha.js');
mocha.setup({ reporter: createSWMochaReporter() });

self.onactivate = function (evt) {
  evt.waitUntil(
    self.clients.claim().then(function () {
      send('waitForTests');
    })
  );
};

// Handles messages between the client and worker. This one is listening for tests
self.addEventListener('message', function (evt) {
  var testList = evt.data;
  testList.forEach(function (testFile) {
    importScripts(testFile);
  });
  mocha.run();
  return mocha.complete;
});

function createSWMochaReporter() {
  return function (runner) {
    runner.on('start', function() {
      send('info', {total: runner.total});
    });

    runner.on('end', function() {
      send('complete', {
        coverage: self.__coverage__ // XXX: not used, just copied from mocha
                                    // adapter.
      });
    });

    runner.on('test', function(test) {
      test.$errors = [];
    });

    runner.on('fail', function(test, error) {
      if ('hook' === test.type) {
        test.$errors = [formatError(error)];
        runner.emit('test end', test);
      } else {
        test.$errors.push(formatError(error));
      }
    });

    runner.on('test end', function(test) {
      var skipped = test.pending === true;

      var result = {
        id: '',
        description: test.title,
        suite: [],
        success: test.state === 'passed',
        skipped: skipped,
        time: skipped ? 0 : test.duration,
        log: test.$errors || []
      };

      var pointer = test.parent;
      while (!pointer.root) {
        result.suite.unshift(pointer.title);
        pointer = pointer.parent;
      }

      send('result', result);
    });
  };
}

function send(command) {
  var args = Array.prototype.slice.call(arguments, 1);
  var msg = { command: command, args: args };
  console.log('Sending', JSON.stringify(msg));
  self.clients.matchAll()
  .then(function (controlled) {
    controlled.forEach(function (client) {
      client.postMessage(msg);
    });
  });
}

var formatError = function(error) {
  var stack = error.stack;
  var message = error.message;

  if (stack) {
    if (message && stack.indexOf(message) === -1) {
      stack = message + '\n' + stack;
    }

    // remove mocha stack entries
    return stack.replace(/\n.+\/mocha\/mocha.js\?\w*\:.+(?=(\n|$))/g, '');
  }

  return message;
};
