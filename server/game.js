const _ = require('lodash');
const fs = require('fs');
const path = require('path');
const constants = require('./constants');

exports.Game = class Game {

    constructor(options) {
        this. options = _.extend({
            players: 2
        }, options);
    }

    async initialize() {

        const [
            golems,
            merchants,
            starting_merchants
        ] = await Promise.all([
            this.parseGolemsFile('./data/golems.txt'),
            this.parseMerchantsFile('./data/merchants.txt', constants.CARD_TYPES.MERCHANT),
            this.parseMerchantsFile('./data/starting_merchants.txt', constants.CARD_TYPES.STARTING_MERCHANT)
        ]);

        this.cards_by_id = _.extend({}, golems, merchants, starting_merchants);

        const starting_gems = _.map([
            'yyy',
            'yyyy',
            'yyyy',
            'yyyg',
            'yyyg'
        ], this.parseGemsString);

        this.state = {
            players: _.chain(this.options.players).range().map((i) => {
                return {
                    id: `P${i}`,
                    hand: _.map(starting_merchants, 'id'),
                    discard: [],
                    golems: [],
                    coins: { 3: 0, 1: 0 },
                    gems: starting_gems[i]
                };
            }).keyBy('id').value(),
            golems: {
                visible: [],
                deck: _.chain(golems).map('id').shuffle().value()
            },
            merchants: {
                visible: [],
                deck: _.chain(merchants).map('id').shuffle().value()
            },
            merchant_gems: [{}, {}, {}, {}, {}, {}],
            coins: [
                [3, 2 * this.options.players],
                [1, 2 * this.options.players]
            ]
        };

        this.drawCardsTo(this.state.golems, 5);
        this.drawCardsTo(this.state.merchants, 6);

        this.state.player_ids = _.keys(this.state.players);
        this.state.current_player_index = 0;

    }

    performAction(player_id, action_type, action_data) {

        const state = _.cloneDeep(this.state);

        if(!this.isPlayerTurn(state, player_id)) throw new Error('OUT_OF_TURN');

        const player = this.getPlayer(state, player_id);

        const actions = {
            [constants.ACTION_TYPES.PLAY]: this.playCard,
            [constants.ACTION_TYPES.ACQUIRE]: this.acquireCard,
            [constants.ACTION_TYPES.REST]: this.rest,
            [constants.ACTION_TYPES.CLAIM]: this.claimCard
        };

        actions[action_type].bind(this)(state, player, action_data);

        state.current_player_index = (++state.current_player_index) % state.player_ids.length;
        this.state = state;

    }

    playCard(state, player, action_data) {

        const { card_id } = action_data;

        // first check that the player has the card in their hand to play
        const card_index = _.indexOf(player.hand, card_id);
        if(!~card_index) {
            console.log(player.hand, card_id);
            throw new Error('NOT_IN_HAND');
        }

        const card_data = this.cards_by_id[card_id];
        if(!card_data) {
            throw new Error('INVALID_CARD_ID');
        }

        // play the card - remove from the hand and add to discard
        player.hand.splice(card_index, 1);
        player.discard.push(card_id);

        // second, pay the input cost
        this.payGems(player, card_data.input);

        // check if this is an upgrade card
        if(card_data.output['^']) {

            // if it is, then the player must have sent upgrade_gems
            const { upgrade_gems } = action_data;

            if(!upgrade_gems) {
                throw new Error('MISSING_UPGRADE_GEMS');
            }

            if(upgrade_gems.length !== card_data.output['^']) {
                throw new Error('INVALID_UPGRADE_GEMS');
            }

            // can't upgrade red gems
            if(_.includes(upgrade_gems, constants.GEM_TYPES.RED)) {
                throw new Error('INVALID_UPGRADE_GEMS');
            }

            // apply each upgrade in sequence (in case they upgraded the same gem multiple times)
            _.each(upgrade_gems, (g) => {
                this.payGems(player, this.parseGemsString(g));
                const gem_index = constants.GEM_TYPE_INDEXES[g];
                const up_g = constants.ORDERED_GEM_TYPES[gem_index + 1];
                this.addGems(player, this.parseGemsString(up_g));
            });

        } else {

            // else just add the output gems
            this.addGems(player, card_data.output);

        }

        // check if the player has too many gems
        this.checkPlayerGemCount(player, action_data);

    }

    acquireCard(state, player, action_data) {

        const { card_id } = action_data;

        // first check that the card is visible
        const card_index = _.indexOf(state.merchants.visible, card_id);
        if(!~card_index) {
            throw new Error('NOT_VISIBLE');
        }

        const card_data = this.cards_by_id[card_id];
        if(!card_data) {
            throw new Error('INVALID_CARD_ID');
        }

        if(card_index > 0) {

            // if this card isn't the first one, the player must have sent payment_gems
            const { payment_gems } = action_data;

            if(!payment_gems) {
                throw new Error('MISSING_PAYMENT_GEMS');
            }

            if(payment_gems.length !== card_index) {
                throw new Error('INVALID_PAYMENT_GEMS');
            }

            this.payGems(player, this.parseGemsString(payment_gems));

            // add the gems to the merchant_gems
            _.each(payment_gems, (g, i) => {
                this.addGems({ gems: state.merchant_gems[i] }, this.parseGemsString(g));
            });

        }

        if(!_.isEmpty(state.merchant_gems[card_index])) {

            // add any gems on the card to the player's stockpile
            this.addGems(player, state.merchant_gems[card_index]);

            // check if the player has too many gems
            this.checkPlayerGemCount(player, action_data);

        }

        // add the card to the player's hand
        player.hand.push(card_id);

        // splice the merchant card and gems
        state.merchants.visible.splice(card_index, 1);
        this.drawCardsTo(state.merchants, 6);

        state.merchant_gems.splice(card_index, 1);
        state.merchant_gems.push({});

    }

    rest(player) {
        player.hand = player.hand.concat(player.discard);
        player.discard = [];
    }

    claimCard(state, player, action_data) {

        const { card_id } = action_data;

        // first check that the card is visible
        const card_index = _.indexOf(state.golems.visible, card_id);
        if(!~card_index) {
            throw new Error('NOT_VISIBLE');
        }

        const card_data = this.cards_by_id[card_id];
        if(!card_data) {
            throw new Error('INVALID_CARD_ID');
        }

        // second, pay the gem cost
        this.payGems(player, card_data.cost);

        // add the golem to the player's stockpile
        player.golems.push(card_id);

        // check for bonus coins
        const bonus_coins = state.coins[card_index];
        if(bonus_coins) {
            player.coins[bonus_coins[0]]++;
            if(--bonus_coins[1] === 0) {
                state.coins.splice(card_index, 1);
            }
        }

        // splice the golem card
        state.golems.visible.splice(card_index, 1);
        this.drawCardsTo(state.golems, 5);

    }

    payGems(player, gems) {
        _.chain(gems).keys().each((g) => {
            // first check that the player can afford the gems
            if(_.get(player.gems, g, 0) < gems[g]) {
                throw new Error('CANNOT_AFFORD');
            }
        }).each((g) => {
            // next actually decrement the gem counts
            player.gems[g] -= gems[g];
        }).value();
    }

    addGems(player, gems) {
        console.log('adding gems', player, gems);
        _.chain(gems).each((n, g) => {
            if(!player.gems[g]) player.gems[g] = 0;
            player.gems[g] += n;
        }).value();
    }

    countGems(gems) {
        return _.chain(gems).keys().reduce((count, g) => {
            return count + gems[g];
        }, 0).value();
    }

    checkPlayerGemCount(player, action_data) {

        const gem_count = this.countGems(player.gems);
        if(gem_count > constants.MAX_GEMS) {

            // if they do, then the player must have sent discard_gems
            const { discard_gems } = action_data;

            if(!discard_gems) {
                throw new Error('MISSING_DISCARD_GEMS');
            }

            if(discard_gems.length !== (gem_count - constants.MAX_GEMS)) {
                throw new Error('INVALID_DISCARD_GEMS');
            }

            this.payGems(player, this.parseGemsString(discard_gems));

        }

    }

    getPlayer(state, player_id, ) {
        const player = state.players[player_id];
        if(!player) throw new Error('INVALID_PLAYER_ID');
        return player;
    }

    isPlayerTurn(state, player_id) {
        return player_id === state.player_ids[state.current_player_index];
    }

    drawCardsTo({ visible, deck }, count) {
        while(visible.length < count && deck.length) {
            visible.push(deck.pop());
        }
    }

    async parseGolemsFile(file_path) {
        return await this.parseDataFile(file_path, constants.CARD_TYPES.GOLEM, (line) => {
            const [score_string, gems_string] = line.split(':');
            return {
                score: parseInt(score_string),
                cost: this.parseGemsString(gems_string)
            }
        });
    }

    async parseMerchantsFile(file_path, prefix) {
        return await this.parseDataFile(file_path, prefix, (line) => {
            const [input_string, output_string] = line.split('>');
            return {
                input: this.parseGemsString(input_string),
                output: this.parseGemsString(output_string)
            };
        });
    }

    async parseDataFile(file_path, prefix, mapper) {
        const data = await this.readFileAsync(file_path);
        return _.chain(data).split('\n').map((line, i) => {
            return _.extend(mapper(line), {
                id: `${prefix}${i}`
            });
        }).keyBy('id').value();
    }

    parseGemsString(gems_string) {
        return _.countBy(gems_string);
    }

    async readFileAsync(file_path) {
        return new Promise((resolve, reject) => {
            fs.readFile(path.resolve(__dirname, file_path), 'utf-8', (err, data) => {
                if(err) return reject(err);
                return resolve(data);
            });
        });
    }

}