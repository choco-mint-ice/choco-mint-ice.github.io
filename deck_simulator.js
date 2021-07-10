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
    const multipleMatch = requirementText.match(/^(\d+) (.*)/);
    if (multipleMatch) {
        const [_, count, card] = multipleMatch;
        return {card, count: parseInt(count)};
    }
    const inDeckMatch = requirementText.match(/^-(\d+) (.*)/);
    if (inDeckMatch) {
        const [_, count, card] = inDeckMatch;
        return {card, inDeck: true, count: parseInt(count)};
    }
    return {card: requirementText, count: 1};
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
    const deckSize = deck.length;
    const deckCounts = {};
    for (const card of deck) {
        deckCounts[card] = (deckCounts[card] || 0) + 1;
    }

    const comboCardsCountsInDeck = [];
    for (const andRequirements of combo) {
        const andRequirementsIdentity = [];
        for (const orRequirements of andRequirements) {
            for (const {card, max, min} of orRequirements) {
                if (deckCounts[card]) {
                    andRequirementsIdentity.push({deckCount: deckCounts[card], card, max, min});
                }
            }
        }
        if (andRequirementsIdentity.length > 0) {
            comboCardsCountsInDeck.push(andRequirementsIdentity);
        }
    }
    const json = JSON.stringify({deckSize, handSize, trials, comboCardsCountsInDeck});
    // Same hashing algorithm for strings as used in Java
    let hash = 0;
    for (let i = 0; i < json.length; i++) {
        const char = json.charCodeAt(i);
        hash = hash * 31 + char;
        hash = hash & hash // Make sure we don't go past the 32 bit limit;
    }
    return hash;
}

function replaceCardNamesWithNumbers(deck, combo) {
    // Doing this allows us to store the random hand in an array instead of a map for better performance
    const cards = new Set(deck);
    for (const andRequirements of combo) {
        for (const orRequirements of andRequirements) {
            for (const {card} of orRequirements) {
                cards.add(card);
            }
        }
    }
    const cardToNumber = {};
    let currentNumber = 0;
    for (const card of cards) {
        cardToNumber[card] = currentNumber++;
    }
    for (let i = 0; i < deck.length; i++) {
        deck[i] = cardToNumber[deck[i]];
    }
    for (const andRequirements of combo) {
        for (const orRequirements of andRequirements) {
            for (const requirement of orRequirements) {
                requirement.card = cardToNumber[requirement.card];
            }
        }
    }
}

function runSimulations(deck, combo, handSize, trials) {
    const deckCounts = {};
    for (const card of deck) {
        deckCounts[card] = (deckCounts[card] || 0) + 1;
    }
    // Fisher-Yates shuffle for generating hands using crypto.getRandomValues for better performance over Math.random
    const randomBytesLength = 2 ** 16;
    const randomBytes = new Uint8Array(randomBytesLength);
    const randomBytesSize = deck.length < 256 ? 1 : 2;
    const maxRandomNumber = 2 ** (8 * randomBytesSize);
    let randomBytesIndex = randomBytesLength;
    let successfulTrials = 0;

    let maxCardNumberInDeck = 0;
    for (const card of deck) {
        maxCardNumberInDeck = Math.max(maxCardNumberInDeck, card);
    }

    const maxAcceptables = [];
    for (let position = 0; position < handSize; position++) {
        const range = deck.length - position;
        maxAcceptables[position] = maxRandomNumber - (maxRandomNumber % range);
    }

    const hand = new Uint16Array(maxCardNumberInDeck + 1);
    for (let i = 0; i < trials; i++) {
        const maxAcceptablesLength = maxAcceptables.length;
        for (let j = 0; j < hand.length; j++) hand[j] = 0;
        for (let position = 0; position < maxAcceptablesLength; position++) {
            const range = deck.length - position;
            const maxAcceptable = maxAcceptables[position];
            while (true) {
                if (randomBytesIndex === randomBytesLength) {
                    crypto.getRandomValues(randomBytes);
                    randomBytesIndex = 0;
                }
                let randomNumber = randomBytes[randomBytesIndex++];
                if (randomBytesSize === 2) {
                    randomNumber = (randomNumber << 8) | randomBytes[randomBytesIndex++]
                }
                if (randomNumber < maxAcceptable) {
                    const randomIndex = position + (randomNumber % range);
                    const card = deck[randomIndex];
                    deck[randomIndex] = deck[position];
                    deck[position] = card;
                    const cardCount = hand[card];
                    hand[card] = cardCount + 1;
                    break;
                }
            }
        }

        const hasCombo = combo.some(andRequirements => {
            return andRequirements.every(orRequirements => {
                return orRequirements.some(({card, inDeck, count}) => {
                    const handCount = hand[card];
                    return inDeck ? (deckCounts[card] || 0) - handCount >= count : handCount >= count
                });
            })
        });
        if (hasCombo) {
            successfulTrials++;
        }
    }
    return successfulTrials;
}

function runSimulationsWorkerFactory() {
    const workerCode = `
(function() {
    ${runSimulations.toString()}

    addEventListener('message', ({data}) => {
        const {deck, combo, handSize, trials} = data;
        postMessage({data, result: runSimulations(deck, combo, handSize, trials)});
    });
})()`;
    return new Worker(URL.createObjectURL(new Blob([workerCode], {type: 'text/javascript'})));
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
        this.auto = qs('.auto-simulate');
        this.simulateButton = qs('.simulate');
        this.result = qs('.result');
        this.deck = qs('.deck');
        this.combo = qs('.combo');
        this.useWorkers = true;

        const urlDataParam = new URLSearchParams(window.location.search).get(DATA_KEY);
        const urlData = urlDataParam && JSON.parse(decodeURIComponent(urlDataParam));
        const localStorageValue = window.localStorage.getItem(DATA_KEY)
        const localStorageData = localStorageValue && JSON.parse(localStorageValue);
        this.data = {...deepClone(defaultData), ...(urlData || localStorageData || {})};

        this.deckController = new TextareaController(this.deck, this.data.deckData, defaultData.deckData);
        this.comboController = new TextareaController(this.combo, this.data.comboData, defaultData.comboData);
        this.workerManager = new WorkerManager(runSimulationsWorkerFactory);
        this.resultsCache = new LruCache(this.data.resultsCache);

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

        this.auto.checked = this.data.autoSimulate;
        this.auto.addEventListener('change', () => {
            this.data.autoSimulate = this.auto.checked;
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

        this.doAutoSimulate(false);
    }

    doAutoSimulate() {
        if (this.data.autoSimulate) {
            this.simulate(true);
        }
    }

    simulate(automaticallyStarted) {
        const deckText = this.deckController.textarea.value;
        const comboText = this.comboController.textarea.value;
        const {handSize, trials} = this.data;
        const {deck, deckErrors} = parseDeck(deckText);
        const {combo, comboErrors} = parseCombo(comboText);
        const identity = calculateIdentity(deck, combo, handSize, trials);
        if (automaticallyStarted) {
            const cachedResult = this.resultsCache.get(identity);
            if (cachedResult !== undefined) {
                this.result.textContent = `${parseFloat((cachedResult * 100).toFixed(5))}%`;
                return;
            }
        }
        console.time('simulate');
        replaceCardNamesWithNumbers(deck, combo);
        this.lastIdentity = identity;
        if (this.useWorkers) {
            this.workerManager.postMessage({identity, deck, combo, handSize, trials});
            this.workerManager.resultsCallback = workerResults => {
                const successfulTrials = workerResults.reduce((curr, acc) => curr + acc, 0);
                this.setRunSimulationsResult(identity, successfulTrials / trials);
            };
        } else {
            const successfulTrials = runSimulations(deck, combo, handSize, trials);
            this.setRunSimulationsResult(identity, successfulTrials / trials);
        }
    }

    setRunSimulationsResult(identity, result) {
        this.resultsCache.set(identity, result);
        this.result.textContent = `${parseFloat((result * 100).toFixed(5))}%`;
        console.timeEnd('simulate');
    }
}

class LruCache {
    maxEntries = 10;

    constructor(storage) {
        this.storage = storage;
    }

    get(key) {
        for (let i = 0; i < this.storage.length; i++) {
            if (this.storage[i][0] === key) {
                const entry = this.storage.splice(i, 1);
                this.storage.push(entry[0]);
                return entry[0][1];
            }
        }
        return undefined;
    }

    set(key, value) {
        for (let i = 0; i < this.storage.length; i++) {
            if (this.storage[i][0] === key) {
                this.storage.splice(i, 1);
            }
        }
        this.storage.push([key, value]);
        if (this.storage.length > this.maxEntries) {
            this.storage.splice(0, 1);
        }
    }
}

class WorkerManager {
    workers = [];
    results = [];
    messageIndex = 0;
    resultCallback = () => {};

    constructor(workerFactory) {
        const workerCount = (navigator.hardwareConcurrency || 2) - 1;
        for (let i = 0; i < workerCount; i++) {
            const worker = workerFactory();
            this.workers.push(worker);
            worker.addEventListener('message', ({data}) => {
                if (this.messageIndex !== data.messageIndex) {
                    this.results.push(data.result);
                    if (this.results.length === this.workers.length) {
                        this.resultsCallback(this.results);
                    }
                }
            });
        }
    }

    postMessage(message) {
        const workerCount = this.workers.length;
        this.results = [];
        this.messageIndex++;
        for (let i = 0; i < workerCount; i++) {
            let workerTrials = Math.floor(message.trials / workerCount);
            if (i === 0) {
                workerTrials += message.trials % workerCount;
            }
            this.workers[i].postMessage({...message, trials: workerTrials, messageIndex: this.messageIndex});
        }
    }
}

const defaultDeck = `# Add your deck in this box and the combos in the one to the right
# Comments start with a '#' and empty lines are ignored
# You can add a new deck or combo by entering a new name and clicking New
# And then you can use the drop-down to switch between them
# And click Delete to delete them
# Deleting the last check or combo will reset the state back to the default
# Click Simulate after adding your deck and combos to get the result
# Or click Auto to enable auto-simulation
# You can click Save to save your data to local storage
# Or click Copy to copy a link to share with others

# List the total number of cards
40 total

# List each card needed for a combo
3 card a
3 card b
3 card c
3 card d
3 card e
3 card f
1 card g`;

const defaultCombo = `# Simple one card combo
card a

# Multi-card combo, need card b and either card c or card d
card b + (card c | card d)

# You can also specify that multiple copies of a card are needed
card b + 2 card e

# And that a card must remain in the deck by using a negative number
# Here, at least 1 copy of card g must remain in the deck
card b + card f + -1 card g`;

DATA_KEY = 'data';

const defaultData = {
    handSize: 5,
    trials: 1_000_000,
    autoSimulate: true,
    deckData: {selectedValue: 'Default', entries: {'Default': defaultDeck}},
    comboData: {selectedValue: 'Default', entries: {'Default': defaultCombo}},
    resultsCache: [],
};

window.onload = () => {
    window.mainController = new MainController(document.body, defaultData);
};