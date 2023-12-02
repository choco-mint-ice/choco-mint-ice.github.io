const tileRewards = [
    {miyu: 5},
    {report: 20},
    {credit: 2000},
    {stone: 10},
    {},
    {miyu: 4},
    {eligma: 6},
    {report: 10},
    {stone: 12},
    {credit: 1600},
    {},
    {credit: 2400},
    {eligma: 12},
    {miyu: 7},
    {eligma: 8},
    {report: 22},
    {stone: 15},
    {credit: 3200},
];
const fixedTicketTiles = new Set([4]);
const advanceTiles = {10: 6};

const lapRewards = [
    {report: 20, miyu: 3, pyro: 20},
    {stone: 20, miyu: 3, pyro: 20},
    {report: 40, miyu: 3},
    {stone: 40, miyu: 3, pyro: 20},
    {report: 75, miyu: 3},
    {stone: 60, miyu: 3, pyro: 20},
    {miyu: 3, recruitmentTicket: 5},
    {report: 100, miyu: 3, pyro: 20},
    {stone: 100, miyu: 3},
    {secretTechNotes: 1, miyu: 3, pyro: 20},
    {credit: 1200, miyu: 5},
    {credit: 1200, miyu: 5, pyro: 20},
    {credit: 1200, miyu: 5},
    {credit: 1200, miyu: 5, pyro: 20},
    {credit: 1200, miyu: 5},
    {credit: 2000, miyu: 5},
    {credit: 2000, miyu: 5, pyro: 30},
    {credit: 2000, miyu: 5},
    {credit: 2000, miyu: 5},
    {credit: 2000, miyu: 5, pyro: 30},
];
const fixedTicketLaps = new Set([1, 3, 5, 7, 9]);

const rollRewards = [
    {rollCount: 1, rewards: {credit: 100}},
    {rollCount: 5, rewards: {credit: 100}},
    {rollCount: 10, rewards: {credit: 100}},
    {rollCount: 20, rewards: {credit: 100}},
    {rollCount: 30, rewards: {credit: 100}},
    {rollCount: 40, rewards: {credit: 100}},
    {rollCount: 50, rewards: {credit: 200}},
    {rollCount: 60, rewards: {credit: 200}},
    {rollCount: 70, rewards: {credit: 200}},
    {rollCount: 80, rewards: {credit: 200}},
    {rollCount: 90, rewards: {credit: 300}},
    {rollCount: 100, rewards: {credit: 300}},
];

function simulateDiceRace(rolls, targetTileIndices) {
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
            addRewards(lapRewards[currentLapIndex])
            if (fixedTicketLaps.has(currentLapIndex)) {
                addFixedTicket();
            }
            currentLapIndex++;
            currentTileIndex -= trackLength;
        }
        addRewards(tileRewards[currentTileIndex]);
        if (fixedTicketTiles.has(currentTileIndex)) {
            addFixedTicket();
        }

        if (advanceTiles[currentTileIndex]) {
            advance(advanceTiles[currentTileIndex]);
        }

        for (const targetTileIndex of targetTileIndices) {
            const targetRoll = (targetTileIndex - currentTileIndex + trackLength) % trackLength;
            if (fixedTickets[targetRoll]) {
                fixedTickets[targetRoll]--;
                advance(targetRoll);
                break;
            }
        }
    }

    for (const {rollCount, rewards} of rollRewards) {
        if (rolls >= rollCount) {
            addRewards(rewards);
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
    const rollCount = ap * 1.8 * (1 + (bonus / 100)) / 500;
    const targetTileIndices = [...document.querySelectorAll('.tile-checkbox').entries()]
        .filter(([index, checkbox]) => checkbox.checked)
        .map(([index, checkbox]) => index);

    const totalRewards = {};
    let totalLaps = 0;
    for (let i = 0; i < trials; i++) {
        const {rewards, laps} = simulateDiceRace(rollCount, targetTileIndices);
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

    const comissionApValue = (totalRewards.credit + 32 * totalRewards.stone) / 3.4045
        + totalRewards.report * 2000 / 160;
    const rows = [
        ['Credits', `${totalRewards.credit || 0}k`],
        ['Advanced activity reports', totalRewards.report],
        ['Advanced equipment stones', totalRewards.stone],
        ['Comission AP value', `${comissionApValue}`],
        ['Comission AP efficiency', `${comissionApValue / ap}`],
        ['Miyu (Swimsuit) elephs', totalRewards.miyu],
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
        } else if (reward.eligma) {
            label.textContent = `${reward.eligma} eligma`;
        } else if (reward.miyu) {
            label.textContent = `${reward.miyu} Miyu (Swimsuit) elephs`;
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
