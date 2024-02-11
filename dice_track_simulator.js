const firstClearCurrency = 3125;
const webEventCurrency = 0;
const tileRewards = [
    {},
    {equipment: 53},
    {stone: 13},
    {report: 17},
    {},
    {credit: 2000},
    {equipment: 41},
    {report: 11},
    {eligma: 5},
    {credit: 1600},
    {},
    {credit: 1800},
    {eligma: 4},
    {stone: 11},
    {equipment: 37},
    {credit: 1900},
    {},
    {report: 19},
];
const fixedTicketTiles = new Set([0]);
const advanceTiles = {4: 3, 10: 1, 16: 2};

const lapRewards = [
    {report: 20, pyro: 20},
    {stone: 20},
    {report: 40, pyro: 20},
    {stone: 40},
    {report: 75, pyro: 20},
    {stone: 60},
    {pyro: 600},
    {report: 100},
    {stone: 80},
    {secretTechNotes: 1, pyro: 20},
    {credit: 1200},
    {credit: 1200},
    {credit: 1200},
    {credit: 1200},
    {credit: 1200, pyro: 20},
    {credit: 2000},
    {credit: 2000},
    {credit: 2000},
    {credit: 2000},
    {credit: 2000, pyro: 20},
    {},
    {},
    {},
    {},
    {pyro: 20},
    {},
    {},
    {},
    {},
    {pyro: 20},
    {},
    {},
    {},
    {},
    {pyro: 30},
    {},
    {},
    {},
    {},
    {pyro: 30},
];
const fixedTicketLaps = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);

const rollRewards = [
    {rollCount: 5, rewards: {credit: 100}},
    {rollCount: 10, rewards: {credit: 100}},
    {rollCount: 20, rewards: {credit: 100}},
    {rollCount: 60, rewards: {credit: 200}},
    {rollCount: 80, rewards: {credit: 200}},
    {rollCount: 100, rewards: {credit: 200}},
    {rollCount: 120, rewards: {credit: 200}},
    {rollCount: 140, rewards: {credit: 200}},
    {rollCount: 160, rewards: {credit: 200}},
    {rollCount: 180, rewards: {credit: 200}},
    {rollCount: 200, rewards: {credit: 300}},
];

function simulateDiceRace(rolls, targetTileIndices, ignoreFirstTimeRewards) {
    const totalRewards = {};
    const fixedTickets = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0};
    const trackLength = tileRewards.length;
    let currentTileIndex = 0;
    let currentLapIndex = 0;


    function getDiceRoll() {
        return 1 + Math.floor(Math.random() * 6)
    }

    function addFixedTicket() {
        fixedTickets[getDiceRoll()]++;
    }

    function addRewards(rewards) {
        for (const [type, amount] of Object.entries(rewards || {})) {
            if (!totalRewards[type]) {
                totalRewards[type] = 0;
            }
            totalRewards[type] += amount;
        }
    }

    function advance(tileCount) {
        currentTileIndex += tileCount;
        if (currentTileIndex >= trackLength) {
            if (!ignoreFirstTimeRewards) {
                addRewards(lapRewards[currentLapIndex])
                if (fixedTicketLaps.has(currentLapIndex)) {
                    addFixedTicket();
                }
            }
            currentLapIndex++;
            currentTileIndex -= trackLength;
        }
        addRewards(tileRewards[currentTileIndex]);
        if (fixedTicketTiles.has(currentTileIndex)) {
            addFixedTicket();
        }

        if (advanceTiles[currentTileIndex]) {
            advance(advanceTiles[currentTileIndex])
            return;
        }

        for (const targetTileIndex of targetTileIndices) {
            const targetRoll = (targetTileIndex - currentTileIndex + trackLength) % trackLength;
            if (fixedTickets[targetRoll]) {
                fixedTickets[targetRoll]--;
                advance(targetRoll);
                return;
            }
        }
    }

    if (!ignoreFirstTimeRewards) {
        for (const {rollCount, rewards} of rollRewards) {
            if (rolls >= rollCount) {
                addRewards(rewards);
            }
        }
    }

    for (let i = 0; i < rolls; i++) {
        advance(getDiceRoll());
    }

    while (Object.values(fixedTickets).reduce((a, b) => a + b, 0)) {
        for (const [tileCountString, ticketCount] of Object.entries(fixedTickets)) {
            const tileCount = Number(tileCountString);
            if (ticketCount) {
                fixedTickets[tileCount]--;
                advance(tileCount);
                break;
            }
        }
    }

    return {rewards: totalRewards, laps: currentLapIndex};
}

const qs = selector => document.querySelector(selector);
const ce = tag => document.createElement(tag);

function runSimulations() {
    const ap = Number(qs('#ap').value);
    const bonus = Number(qs('#bonus').value);
    const trials = Number(qs('#trials').value);
    const ignoreFirstTimeRewards = qs('#ignoreFirstTimeRewards').checked;
    const currency = ap * 1.6 * (1 + (bonus / 100)) + (ignoreFirstTimeRewards ? 0 : firstClearCurrency + webEventCurrency);
    const rolls = Math.floor(currency / 500);
    const targetTileIndices = [...document.querySelectorAll('.tile-checkbox').entries()]
        .filter(([index, checkbox]) => checkbox.checked)
        .map(([index, checkbox]) => index);

    const totalRewards = {};
    let totalLaps = 0;
    for (let i = 0; i < trials; i++) {
        const {rewards, laps} = simulateDiceRace(rolls, targetTileIndices, ignoreFirstTimeRewards);
        totalLaps += laps;
        for (const [type, amount] of Object.entries(rewards)) {
            if (!totalRewards[type]) {
                totalRewards[type] = 0;
            }
            totalRewards[type] += amount;
        }
    }

    for (const type of Object.keys(totalRewards)) {
        totalRewards[type] /= trials;
    }

    const commissionApValue = (totalRewards.credit + 32 * totalRewards.stone) / 3.4045
        + totalRewards.report * 2000 / 165;
    const rows = [
        ['Credits', `${totalRewards.credit || 0}k`],
        ['Advanced activity reports', totalRewards.report],
        ['Advanced equipment stones', totalRewards.stone],
        ['Commission AP value', `${commissionApValue}`],
        ['Commission AP efficiency', `${commissionApValue / ap}`],
        ['Eligma', totalRewards.eligma],
        ['Pyro', totalRewards.pyro],
        ['Laps', totalLaps / trials],
    ];
    const result = qs('#result');
    result.innerHTML = '';
    for (const [key, value] of rows) {
        const rowElement = ce('tr');
        const keyElement = ce('td');
        keyElement.textContent = key;
        rowElement.appendChild(keyElement);
        const valueElement = ce('td');
        valueElement.textContent = value || 0;
        rowElement.appendChild(valueElement);
        result.appendChild(rowElement);
    }
    return totalRewards
}

window.onload = () => {
    const tileSelector = qs('#tile-selector');
    for (const [index, reward] of tileRewards.entries()) {
        const tileWrapper = ce('div');

        const checkbox = ce('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'tile-checkbox';
        tileWrapper.appendChild(checkbox);

        const label = ce('span');
        if (reward.stone) {
            label.textContent = `${reward.stone} advanced equipment stones`;
        } else if (reward.credit) {
            label.textContent = `${reward.credit}k credits`;
        } else if (reward.report) {
            label.textContent = `${reward.report} advanced activity reports`;
        } else if (reward.equipment) {
            label.textContent = `${reward.equipment} equipment blueprints`;
        } else if (reward.eligma) {
            label.textContent = `${reward.eligma} eligma`;
        } else if (advanceTiles[index]) {
            label.textContent = `Advance ${advanceTiles[index]} tiles`;
        } else if (fixedTicketTiles.has(index)) {
            label.textContent = 'Dice fixed ticket';
        }
        tileWrapper.appendChild(label);
        tileSelector.appendChild(tileWrapper);
    }
    qs('#run-simulations-button').onclick = runSimulations;
};
