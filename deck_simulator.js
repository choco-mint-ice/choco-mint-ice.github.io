function splitLines(input) {
    return input.split('\n').map(line => line.replace(/^\s+|\s+$/g, '')).filter(line => !!line && !line.startsWith('#'));
}

function parseDeck(deckText) {
    const deck = [];
    const deckErrors = [];
    let total = undefined;
    for (const line of splitLines(deckText)) {
        const match = line.match(/^(\d+) (.*)/);
        if (!match) {
            deckErrors.push(`Line with invalid format ignored: ${line}.`);
            continue;
        }
        const [_, countString, card] = match;
        const count = parseInt(countString);
        if (card === 'total') {
            total = count;
        } else {
            for (let i = 0; i < count; i++) {
                deck.push(card);
            }
        }
    }
    if (total !== undefined) {
        for (let i = deck.length; i < total; i++) {
            deck.push('UNKNOWN CARD');
        }
    }
    return {deck, deckErrors};
}

function parseRequirement(requirementText, comboErrors) {
    requirementText = requirementText.trim();
    const exactRequirementMatch = requirementText.match(/^(\d+) (.*)/);
    if (exactRequirementMatch) {
        const [_, count, card] = exactRequirementMatch;
        return {card, min: parseInt(count), max: parseInt(count)};
    }
    const rangeRequirementMatch = requirementText.match(/^(\d+)-(\d+) (.*)/);
    if (rangeRequirementMatch) {
        const [_, min, max, card] = rangeRequirementMatch;
        return {card, min: parseInt(min), max: parseInt(max)};
    }
    // Infinity can't be parsed to JSON so just pick a really large number.
    return {card: requirementText, min: 1, max: 1_000_000};
}

function parseCombo(comboText) {
    const combo = [];
    const comboErrors = [];
    for (const line of splitLines(comboText)) {
        const option = [];
        for (const andRequirementText of line.split('+').map(req => req.trim())) {
            const orMatch = andRequirementText.match(/^\((.*)\)$/);
            if (orMatch) {
                option.push(orMatch[1].split('|').map(req => parseRequirement(req)));
            } else {
                option.push([parseRequirement(andRequirementText)]);
            }
        }
        combo.push(option);
    }
    return {combo, comboErrors};
}

function calculateIdentity(deck, combo, handSize, trials) {
    const comboCards = new Set();
    for (const andRequirements of combo) {
        for (const orRequirements of andRequirements) {
            for (const {card} of orRequirements) {
                comboCards.add(card);
            }
        }
    }
    const deckSize = deck.length;
    const deckCounts = {};
    for (const card of deck) {
        deckCounts[card] = (deckCounts[card] || 0) + 1;
    }
    const comboCardsCountsInDeck = {};
    for (const comboCard of [...comboCards].sort()) {
        if (deckCounts[comboCard]) {
            comboCardsCountsInDeck[comboCard] = deckCounts[comboCard];
        }
    }
    return JSON.stringify({deckSize, handSize, trials, comboCardsCountsInDeck});
}

function runSimulations(deck, combo, handSize, trials) {
    let count = 0;
    for (let i = 0; i < trials; i++) {
        const deckIndices = new Set();
        while (deckIndices.size < Math.min(deck.length, handSize)) {
            deckIndices.add(Math.floor(Math.random() * deck.length));
        }
        const hand = {};
        for (const deckIndex of deckIndices) {
            const card = deck[deckIndex];
            hand[card] = (hand[card] || 0) + 1;
        }
        const hasCombo = combo.some(andRequirements => {
            return andRequirements.every(orRequirements => {
                return orRequirements.some(({card, min, max}) => {
                    const count = hand[card] || 0;
                    return count >= min && count <= max;
                });
            })
        });
        if (hasCombo) {
            count++;
        }
    }
    return count / trials;
}

function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}

class TextareaController {
    constructor(element, data, defaultData) {
        const qs = selector => element.querySelector(selector);
        this.select = qs('.textarea-select');
        this.name = qs('.textarea-name');
        this.newButton = qs('.textarea-new');
        this.clearButton = qs('.textarea-clear');
        this.deleteButton = qs('.textarea-delete');
        this.textarea = qs('.textarea');
        this.defaultData = defaultData;
        this.data = data;
        this.render();

        this.select.addEventListener('change', () => {
            this.data.selectedValue = this.select.value;
            this.render();
        });

        this.newButton.addEventListener('click', () => {
            const newName = this.name.value.trim();
            if (newName === '') {
                return;
            }
            this.data.selectedValue = newName;
            this.data.entries[this.data.selectedValue] = this.textarea.value;
            this.name.value = '';
            this.render();
        });

        this.clearButton.addEventListener('click', () => {
            this.textarea.value = '';
            this.textarea.dispatchEvent(new Event('input'));
        });

        this.deleteButton.addEventListener('click', () => {
            const name = this.data.selectedValue;
            const oldNames = Object.keys(this.data.entries);
            delete this.data.entries[name];
            if (oldNames.length === 1) {
                this.data.entries = deepClone(this.defaultData.entries);
            }
            const newNames = Object.keys(this.data.entries);
            const newIndex = Math.max(oldNames.indexOf(name) - 1, 0);
            this.data.selectedValue = newNames[newIndex];
            this.render();
        });

        this.textarea.addEventListener('input', () => {
            this.data.entries[this.data.selectedValue] = this.textarea.value;
        });
    }

    render() {
        const newNames = new Set(Object.keys(this.data.entries));
        const oldNames = {};
        for (const option of [...this.select.children]) {
            this.select.removeChild(option);
            if (newNames.has(option.value)) {
                oldNames[option.value] = option;
            }
        }
        for (const name of newNames) {
            if (oldNames[name]) {
                this.select.appendChild(oldNames[name]);
            } else {
                const option = document.createElement('option');
                option.value = name;
                option.textContent = name;
                this.select.appendChild(option);
            }
        }
        this.select.value = this.data.selectedValue;
        this.textarea.value = this.data.entries[this.data.selectedValue];
        this.textarea.dispatchEvent(new Event('input'));
    }
}

class MainController {
    constructor(element, defaultData) {
        const qs = selector => element.querySelector(selector);
        this.handSize = qs('.hand-size');
        this.trials = qs('.trials');
        this.saveButton = qs('.save');
        this.linkButton = qs('.link');
        this.autoSimulate = qs('.auto-simulate');
        this.simulateButton = qs('.simulate');
        this.result = qs('.result');
        this.deck = qs('.deck');
        this.combo = qs('.combo');
        this.lastIdentity = '';

        const urlDataParam = new URLSearchParams(window.location.search).get(DATA_KEY);
        const urlData = urlDataParam && JSON.parse(decodeURIComponent(urlDataParam));
        const localStorageValue = window.localStorage.getItem(DATA_KEY)
        const localStorageData = localStorageValue && JSON.parse(localStorageValue);
        this.data = urlData || localStorageData || deepClone(defaultData);

        this.deckController = new TextareaController(this.deck, this.data.deckData, defaultData.deckData);
        this.comboController = new TextareaController(this.combo, this.data.comboData, defaultData.comboData);
        this.doAutoSimulate();

        this.handSize.value = this.data.handSize;
        this.handSize.addEventListener('change', () => {
            this.data.handSize = this.handSize.value;
            this.doAutoSimulate();
        });

        this.trials.value = this.data.trials;
        this.trials.addEventListener('change', () => {
            this.data.trials = this.trials.value;
            this.doAutoSimulate();
        });

        this.autoSimulate.checked = this.data.autoSimulate;
        this.autoSimulate.addEventListener('change', () => {
            this.data.autoSimulate = this.autoSimulate.checked;
            this.doAutoSimulate();
        });

        this.deckController.textarea.addEventListener('input', () => {
            this.doAutoSimulate();
        });

        this.comboController.textarea.addEventListener('input', () => {
            this.doAutoSimulate();
        });

        this.saveButton.addEventListener('click', () => {
            window.localStorage.setItem('data', JSON.stringify(this.data));
        });

        this.linkButton.addEventListener('click', () => {
            const encodedData = encodeURIComponent(JSON.stringify(this.data));
            const url = `${window.location.href.split('?')[0]}?${DATA_KEY}=${encodedData}`;
            navigator.clipboard.writeText(url);
        });

        this.simulateButton.addEventListener('click', () => {
            this.simulate(false);
        });
    }

    doAutoSimulate() {
        if (this.data.autoSimulate) {
            this.simulate(true);
        }
    }

    simulate(skipIfIdentityUnchanged) {
        const deckText = this.deckController.textarea.value;
        const comboText = this.comboController.textarea.value;
        const {handSize, trials} = this.data;
        const {deck, deckErrors} = parseDeck(deckText);
        const {combo, comboErrors} = parseCombo(comboText);
        const identity = calculateIdentity(deck, combo, handSize, trials);
        if (skipIfIdentityUnchanged && identity === this.lastIdentity) {
            return;
        }
        const result = runSimulations(deck, combo, handSize, trials);
        this.lastIdentity = identity;
        this.result.textContent = `Result: ${parseFloat(result.toFixed(10))}`;
    }
}

const defaultDeck = `# Add your deck in this box and the combos in the one to the right
# Comments start with a '#' and empty lines are ignored
# You can add a new deck or combo by entering a new name and clicking New
# And then you can use the drop-down to switch between them
# And click Delete to delete them
# Deleting the last check or combo will reset the state back to the default
# Click Simulate after adding your deck and combos to get the result
# You can click Save to save your data to local storage
# Or click Link to copy a link to share with others

# List the total number of cards
40 total

# List each card needed for a combo
3 card a
3 card b
3 card c
3 card d
1 card e
1 card f
1 card g`;

const defaultCombo = `# Simple one card combo
card a

# Multi-card combo, need card b and either card c or card d
card b + (card c | card d)

# You can also specify that a card must not be in the hand, or a range
card e + 0 card f + 1-2 card g`;

DATA_KEY = 'data';

const defaultData = {
    handSize: 5,
    trials: 10_000,
    autoSimulate: true,
    deckData: {selectedValue: 'Default', entries: {'Default': defaultDeck}},
    comboData: {selectedValue: 'Default', entries: {'Default': defaultCombo}},
};


window.onload = () => {
    new MainController(document.body, defaultData);
};