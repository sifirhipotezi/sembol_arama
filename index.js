import { SYMBOLS } from './symbols.js';
import { NORMS } from './norms.js';
import { SCALED_SCORES } from './scaled-scores.js';
import { random, shuffle } from './array.js';

const TIME_LIMIT_SECONDS = 120;
const PRACTICE_COUNT = 2;
const MAX_PUZZLE_COUNT = 60;
globalThis.RAW_SCORE = 0;

const $ = document.querySelector.bind(document);
const $$ = (selector) => [...document.querySelectorAll(selector)];

document.addEventListener('DOMContentLoaded', main);

async function main() {
  updateTextboxes();
  $('#years').addEventListener('input', updateTextboxes);
  await practice();
  await waitFor(1_000);

  $('.panel:first-child').classList.add('hidden');
  $('.panel:last-child').classList.remove('hidden');
  $('.panel:last-child').classList.add('fade-in');
  $('#start').addEventListener('click', start);
}

function start() {
  $('.panel:not(.hidden) > h4').remove();
  $('.start').remove();
  $('.notif').classList.remove('fade-out');
  $('.notif').style.color = 'black';

  const coinFlips = shuffle([
    ...new Array(MAX_PUZZLE_COUNT / 2).fill(true),
    ...new Array(MAX_PUZZLE_COUNT / 2).fill(false),
  ]);

  let puzzleNumber = 1;
  const coinFlip = coinFlips[puzzleNumber - 1];
  refreshPuzzle(coinFlip);

  const state = { isCountingDown: true };
  countdown(state);

  $('.row').classList.remove('disabled');

  document.addEventListener('click', ({ target: el }) => {
    if (!el.matches('.option')) return;
    const isCorrect = el === findCorrectElement();
    RAW_SCORE += isCorrect ? 1 : -1;
    updateTextboxes();

    if (location.port) {
      console.log(`#${puzzleNumber} - ${isCorrect ? 'CORRECT!' : 'Wrong.'}`);
      if (!isCorrect) alert('Wrong!');
    }

    puzzleNumber++;
    if (puzzleNumber > MAX_PUZZLE_COUNT) {
      $('.row').classList.add('disabled');
      $('.notif').textContent = 'Test complete!';
      state.isCountingDown = false;
      return;
    }

    const coinFlip = coinFlips[puzzleNumber - 1];
    refreshPuzzle(coinFlip);
  });
}

function practice() {
  return new Promise((resolve) => {
    $('h4').textContent = `Practice #${1} of ${PRACTICE_COUNT}`;
    let currentPracticeNumber = 1;

    const coinFlips = shuffle([
      ...new Array(PRACTICE_COUNT / 2).fill(true),
      ...new Array(PRACTICE_COUNT / 2).fill(false),
    ]);

    const callback = async function ({ target: el }) {
      if (!el.matches('.option')) return;
      const isCorrect = el === findCorrectElement();

      const notifElement = $('.notif');
      notifElement.textContent = isCorrect ? 'Good job!' : "Oops, that wasn't right!";
      notifElement.style.color = isCorrect ? 'green' : 'red';
      notifElement.classList.remove('fade-out');
      await waitFor(0);
      notifElement.classList.add('fade-out');

      currentPracticeNumber++;
      if (currentPracticeNumber > PRACTICE_COUNT) {
        document.removeEventListener('click', callback);
        $('.row').classList.add('disabled');
        resolve();
      } else {
        $('h4').textContent = `Practice #${currentPracticeNumber} of ${PRACTICE_COUNT}`;
        refreshPuzzle(coinFlips[1]);
      }
    };

    document.addEventListener('click', callback);
    refreshPuzzle(coinFlips[0]);
  });
}

function refreshPuzzle(hasMatch = true) {
  const pool = shuffle(SYMBOLS);
  const optionCount = $$('.option:not(.no)').length;
  const options = pool.slice(0, optionCount);

  shuffle($$('.option:not(.no)')).forEach((el, i) => {
    const option = options[i];
    el.dataset.symbol = option.symbol;
    el.dataset.degrees = option.degrees;
    el.style.setProperty('--deg', `${option.degrees}deg`);
  });

  const sliceIndex = hasMatch ? optionCount - 1 : optionCount;
  const objectives = pool.slice(sliceIndex, sliceIndex + 2);

  shuffle($$('.objective')).forEach((el, i) => {
    const objective = objectives[i];
    el.dataset.symbol = objective.symbol;
    el.dataset.degrees = objective.degrees;
    el.style.setProperty('--deg', `${objective.degrees}deg`);
  });
}

function findCorrectElement() {
  const options = $$('.option:not(.no)').map(({ dataset }) => dataset);
  const objectives = $$('.objective').map(({ dataset }) => dataset);
  const correctIndex = options.findIndex((option) =>
    objectives.find(
      ({ symbol, degrees }) =>
        symbol === option.symbol && degrees === option.degrees
    )
  );
  return correctIndex === -1 ? $('.no') : $$('.option')[correctIndex];
}

async function waitFor(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function countdown(state) {
  const startTime = new Date();
  while (state.isCountingDown) {
    const millisecondsRemaining =
      TIME_LIMIT_SECONDS * 1_000 + 999 - (new Date() - startTime);
    const timestamp = formatMS(millisecondsRemaining);
    $('.notif').textContent = timestamp;

    if (millisecondsRemaining <= 0) {
      $('.row').classList.add('disabled');
      $('.notif').textContent = "Time's up!";
      sendScoreToDatabase();
      return;
    }

    await waitFor(0);
  }
}

function formatMS(milliseconds) {
  const string = new Date(milliseconds)
    .toLocaleTimeString(navigator.location, {
      timeZone: 'Etc/UTC',
      hour12: false,
      minute: '2-digit',
      second: '2-digit',
    })
    .slice(milliseconds < 60_000 ? 0 : 1);

  if (string.startsWith('00:0')) {
    $('.notif').classList.add('flashing');
    return (milliseconds / 1_000).toFixed(1);
  }

  if (string.startsWith('00:')) {
    return string.replace('00:', '');
  }

  return string;
}

function updateTextboxes() {
  $('#raw-score').value = RAW_SCORE;
  $('#scaled-score').value = rawToScaled(Number($('#years').value), RAW_SCORE);
  $('#iq').value = calculateIQ();
}

function calculateIQ() {
  const years = Number($('#years').value);
  const ageRange = NORMS['age-ranges'].find(([from, to]) => {
    return years >= from && years <= to;
  });
  const i = NORMS['age-ranges'].indexOf(ageRange);
  const mean = NORMS.means[i];
  const sd = NORMS.sds[i];
  const iq = 100 + ((RAW_SCORE - mean) / sd) * 15;
  return iq;
}

function rawToScaled(years, raw) {
  const key = Object.keys(SCALED_SCORES).find((key) => {
    const [from, to] = key.split('-').map(Number);
    return years >= from && years <= to;
  });

  const scaledScores = SCALED_SCORES[key];

  const scaledScore =
    scaledScores.findIndex((value) => {
      const range = Array.isArray(value) ? value : [value, value];
      const [min, max] = range;
      return raw >= min && max >= raw;
    }) + 1;

  return scaledScore;
}


function sendScoreToDatabase() {
  const isAuthenticated = document.querySelector('meta[name="authenticated"]').getAttribute('content') === 'true';
  if (isAuthenticated) {
    const scoreData = {
      overallScore: rawToScaled(Number($('#years').value), RAW_SCORE)
    };

    fetch('/test_results/symbol-search', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(scoreData)
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return response.json();
    })
    .then(data => {
        console.log('Success:', data);
    })
    .catch(error => {
        console.error('Error:', error);
    });
  }
}