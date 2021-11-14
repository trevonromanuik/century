const _ = require('lodash');

exports.MAX_GEMS = 10;

exports.GEM_TYPES = {
    YELLOW: 'y',
    GREEN: 'g',
    BLUE: 'b',
    RED: 'r'
};

exports.ORDERED_GEM_TYPES = [
    exports.GEM_TYPES.YELLOW,
    exports.GEM_TYPES.GREEN,
    exports.GEM_TYPES.BLUE,
    exports.GEM_TYPES.RED
];

exports.GEM_TYPE_INDEXES = _.reduce(exports.ORDERED_GEM_TYPES, (acc, g, i) => {
    acc[g] = i;
    return acc;
}, {});

exports.CARD_TYPES = {
    GOLEM: 'G',
    MERCHANT: 'M',
    STARTING_MERCHANT: 'S'
};

exports.ACTION_TYPES = {
    PLAY: 'PLAY',
    ACQUIRE: 'ACQUIRE',
    REST: 'REST',
    CLAIM: 'CLAIM'
};