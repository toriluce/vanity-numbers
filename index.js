import fs from "fs";
import wordListPath from "word-list";
import dotenv from "dotenv";
import axios from "axios";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  PutCommand,
  GetCommand,
  DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";

dotenv.config();

const client = new DynamoDBClient({ region: process.env.REGION });
const ddb = DynamoDBDocumentClient.from(client);

const PHONE_KEYPAD = {
  2: ["A", "B", "C"],
  3: ["D", "E", "F"],
  4: ["G", "H", "I"],
  5: ["J", "K", "L"],
  6: ["M", "N", "O"],
  7: ["P", "Q", "R", "S"],
  8: ["T", "U", "V"],
  9: ["W", "X", "Y", "Z"],
};

const rawWordList = fs.readFileSync(wordListPath, "utf8").split("\n");
const fallbackWords = rawWordList
  .map((word) => word.toUpperCase())
  .filter(
    (word) => /^[A-Z]+$/.test(word) && word.length >= 3 && word.length <= 7
  );

async function getCategoryWords(category) {
  try {
    const response = await axios.get("https://api.datamuse.com/words", {
      params: {
        ml: category,
        max: 1000,
      },
    });

    const categoryWords = [
      category.toUpperCase(),
      ...response.data
        .map((entry) => entry.word.toUpperCase())
        .filter(
          (word) =>
            /^[A-Z]+$/.test(word) && word.length >= 3 && word.length <= 7
        ),
    ];

    console.log(
      `Found ${categoryWords.length} words for category: ${category}`
    );

    return categoryWords;
  } catch (err) {
    console.error("Error fetching from Datamuse:", err.message);
    return [];
  }
}

function generateVanityOptions(phoneNumber, words, fromCategory) {
  let digits = phoneNumber.replace(/\D/g, "");
  if (digits.length > 10) digits = digits.slice(-10);

  const matches = [];

  for (let word of words) {
    const wordLength = word.length;
    const start = digits.length - wordLength;
    if (start < 0) continue;

    let match = true;
    for (let i = 0; i < wordLength; i++) {
      const digit = digits[start + i];
      const letter = word[i].toUpperCase();
      const allowed = PHONE_KEYPAD[Number(digit)];
      if (!allowed || !allowed.includes(letter)) {
        match = false;
        break;
      }
    }

    if (match) {
      const numberPart = digits.slice(0, start).split("").join(" ");
      const vanity = `${
        numberPart ? numberPart + " " : ""
      }${word.toUpperCase()}`;
      matches.push({ vanity, fromCategory, length: wordLength });
      if (matches.length >= 5) break;
    }
  }

  return matches;
}

function mergeNewTopResults(existingResults, newResults, currentCategory) {
  const existingMap = new Map(existingResults.map((r) => [r.vanity, { ...r }]));

  for (const incoming of newResults) {
    const existing = existingMap.get(incoming.vanity);

    if (existing) {
      if (existing.fromCategory === null && incoming.fromCategory) {
        existing.fromCategory = incoming.fromCategory;
      }
      existingMap.set(incoming.vanity, existing);
    } else {
      existingMap.set(incoming.vanity, incoming);
    }
  }

  const allMatches = Array.from(existingMap.values());

  const fromCategoryMatches = allMatches
    .filter((r) => r.fromCategory !== null)
    .sort((a, b) => b.length - a.length);

  const fallbackMatches = allMatches
    .filter((r) => r.fromCategory === null)
    .sort((a, b) => b.length - a.length);

  return [...fromCategoryMatches, ...fallbackMatches];
}

// ********************* HANDLER FUNCTION *********************

export async function handler(event) {
  console.log("Event received:", JSON.stringify(event, null, 2));

  const rawNumber =
    event?.Details?.ContactData?.CustomerEndpoint?.Address || "0000000000";
  const phoneNumber = String(rawNumber);
  console.log("Caller number:", phoneNumber);

  const validatingCaller =
    event?.Details?.Parameters.validatingCaller || "false";

  let existing;
  try {
    existing = await ddb.send(
      new GetCommand({
        TableName: process.env.TABLE_NAME,
        Key: { callerNumber: phoneNumber },
      })
    );
  } catch (err) {
    console.error("Error reading from DynamoDB:", err);
  }

  if (validatingCaller === "true") {
    console.log("Validating caller.");
    const previousTop = existing?.Item?.topResults || [];
    const best = previousTop.sort((a, b) => b.length - a.length)[0];

    return {
      previousTopResult: best?.vanity || "N/A",
    };
  }

  const category =
    event?.Details?.ContactData?.Attributes?.Category || "general";

  console.log("Category:", category);

  let usedFallback = false;
  const categoryWords = await getCategoryWords(category);
  const categoryMatches = generateVanityOptions(
    phoneNumber,
    categoryWords,
    category
  );
  console.log("Category matches:", categoryMatches);
  if (categoryMatches.length === 0) {
    usedFallback = true;
  }

  let fallbackMatches = [];
  if (categoryMatches.length < 5) {
    usedFallback = true;
    fallbackMatches = generateVanityOptions(phoneNumber, fallbackWords, null);
    console.log("Fallback matches:", fallbackMatches);
  }

  const newMatches = [...categoryMatches, ...fallbackMatches];

  const existingTopResults = existing?.Item?.topResults || [];
  console.log("Existing top results:", existingTopResults);
  const topResults = mergeNewTopResults(
    existingTopResults,
    newMatches,
    category
  );
  console.log("Merged top results:", topResults);
  const previousQueries = existing?.Item?.previousQueries || [];
  const alreadyLogged = previousQueries.some(
    (q) => q.fromCategory === category
  );
  const updatedQueries = alreadyLogged
    ? previousQueries
    : [
        ...previousQueries,
        { fromCategory: category, queryDate: new Date().toISOString() },
      ];

  try {
    await ddb.send(
      new PutCommand({
        TableName: process.env.TABLE_NAME,
        Item: {
          callerNumber: phoneNumber,
          createdAt: existing?.Item?.createdAt || new Date().toISOString(),
          topResults,
          previousQueries: updatedQueries,
        },
      })
    );

    const existingVanities = new Set(existingTopResults.map((r) => r.vanity));
    const newVanityCount = newMatches.filter(
      (r) => !existingVanities.has(r.vanity)
    ).length;
    console.log(
      `${newVanityCount} new vanities found for category "${category}".`
    );
  } catch (err) {
    console.error("DynamoDB write failed:", err);
  }

  return {
    topResult1: newMatches[0]?.vanity || "",
    topResult2: newMatches[1]?.vanity || "",
    topResult3: newMatches[2]?.vanity || "",
    hasVanityResults: newMatches.length > 0,
    usedFallback,
  };
}
