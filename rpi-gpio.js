var fs     = require('fs'),
    path   = require('path'),
    util   = require('util'),
    EventEmitter = require('events').EventEmitter;

var logError = function(err) { if(err) util.debug(err); };

// Constants
var PATH     = '/sys/class/gpio',
    PIN_MAP  = {
        // RPi to BCM
        '1':  null,
        '2':  null,
        '3':  0,
        '4':  null,
        '5':  1,
        '6':  null,
        '7':  4,
        '8':  14,
        '9':  null,
        '10': 15,
        '11': 17,
        '12': 18,
        '13': 21,
        '14': null,
        '15': 22,
        '16': 23,
        '17': null,
        '18': 24,
        '19': 10,
        '20': null,
        '21': 9,
        '22': 25,
        '23': 11,
        '24': 8,
        '25': null,
        '26': 7
    },
    MODE_RPI = 'rpi',
    MODE_BCM = 'bcm',
    DIR_IN   = 'in',
    DIR_OUT  = 'out';

var _write = function(path, value, cb) {
    fs.writeFile(path, value, cb);
}

// Keep track of mode and exported pins
var activeMode = MODE_RPI;
var exportedPins = [];

// Clean up on shutdown
// @todo this currently fails to destroy the symlink
process.on('exit', function () {
    destroy();
});

// Constructor
function Gpio() { }
Gpio.prototype = Object.create(EventEmitter.prototype);

// Expose these constants
Gpio.prototype.MODE_RPI = MODE_RPI;
Gpio.prototype.MODE_BCM = MODE_BCM;
Gpio.prototype.DIR_IN   = DIR_IN;
Gpio.prototype.DIR_OUT  = DIR_OUT;

/**
 * Set pin reference mode. Defaults to 'rpi'.
 *
 * @param {string} mode Pin reference mode, 'rpi' or 'bcm'
 */
Gpio.prototype.setMode = function(mode) {
    if (mode !== MODE_RPI && mode !== MODE_BCM) {
        throw new Error('Cannot set invalid mode [' + mode + ']');
    }
    activeMode = mode;
}

/**
 * Setup a channel for use as an input or output
 *
 * @param {number}   channel   Reference to the pin in the current mode's schema
 * @param {string}   direction The pin direction, either 'in' or 'out'
 * @param {function} cb        Optional callback
 */
Gpio.prototype.setup = function(channel, direction, cb) {
    if (!channel) {
        throw new Error('Channel not specified');
    }
    direction = direction || this.DIRECTION.out;

    var self = this;
    function doExport() {
        exportChannel(channel, function() {
            setListener(channel, function() {
                self.read(channel, function(value) {
                    self.emit('change', channel, value);
                });
            });
            setDirection(channel, direction, cb);
        });
    }

    // Unexport channel if already open
    isExported(channel, function(isOpen) {
        if (isOpen) {
            this.unexportChannel(channel, doExport);
        } else {
            doExport();
        }
    }.bind(this));
}

/**
 * Write a value to a channel
 *
 * @param {number}   channel The channel to write to
 * @param {boolean}  value   If true, turns the channel on, else turns off
 * @param {function} cb      Optional callback
 */
Gpio.prototype.write = function(channel, value, cb) {
    var pin = getPin(channel);
    value = (!!value) ? '1' : '0';
    _write(PATH + '/gpio' + pin + '/value', value, function(err) {
        console.log('Output ' + channel + ' set to ' + value);
        if (err) logError(err);
        if (cb) cb();
    }.bind(this));
};
Gpio.prototype.output = Gpio.prototype.write;

/**
 * Read a value from a channel
 *
 * @param {number}   channel The channel to read from
 * @param {function} cb      Callback which receives the channel's value
 */
Gpio.prototype.read = function(channel, cb /*value*/) {
    var pin = getPin(channel);
    fs.readFile(PATH + '/gpio' + pin + '/value', 'utf-8', function(err, data) {
        if (err) logError(err);
        cb(data);
    });
}
Gpio.prototype.input = Gpio.prototype.read;

function setDirection(channel, direction, cb) {
    if (direction !== DIR_IN && direction !== DIR_OUT) {
        throw new Error('Cannot set invalid direction [' + direction + ']');
    }
    var pin = getPin(channel);
    _write(PATH + '/gpio' + pin + '/direction', direction, function(err) {
        if (err) logError(err);
        if (cb) cb();
    });
}

function exportChannel(channel, cb) {
    var pin = getPin(channel);
    _write(PATH + '/export', pin, function(err) {
        if (err) logError(err);
        exportedPins.push(pin);
        if (cb) cb();
    });
}

// Expose this until the destructor works reliably
Gpio.prototype.unexportChannel = function(channel, cb) {
    var pin = getPin(channel);
    unexportPin(pin, cb);
    fs.unwatchFile(PATH + '/gpio' + pin + '/value');
}

function unexportPin(pin, cb) {
    _write(PATH + '/unexport', pin, function(err) {
        if (err) logError(err);
        if (cb) cb();
    });
}

function isExported(channel, cb) {
    var pin = getPin(channel);
    path.exists(PATH + '/gpio' + pin, function(exists) {
        if (cb) cb(exists);
    });
}

function getPin(channel) {
    var pin = channel;
    if (activeMode === MODE_RPI) {
        pin = PIN_MAP[channel];
    }
    //@todo validate this properly

    return pin;
}

function setListener(channel, cb) {
    var pin = getPin(channel);
    fs.watchFile(PATH + '/gpio' + pin + '/value', cb);
}

function destroy() {
    exportedPins.forEach(function(pin) {
        unexportPin(pin);
    });
}

module.exports = new Gpio;