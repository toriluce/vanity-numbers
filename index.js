import fs from "fs";
import wordListPath from "word-list";
import dotenv from "dotenv";
import axios from "axios";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { PutCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

dotenv.config();

if (!process.env.TABLE_NAME || !process.env.REGION) {
  throw new Error("Missing required environment variables.");
}

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

    let categoryWords = [category.toUpperCase()];

    categoryWords = categoryWords.concat(
      response.data
        .map((entry) => entry.word.toUpperCase())
        .filter(
          (word) =>
            /^[A-Z]+$/.test(word) && word.length >= 3 && word.length <= 7
        )
    );

    console.log(
      `Found ${categoryWords.length} words for category: ${category}`
    );

    return categoryWords;

  } catch (err) {
    console.error("Error fetching from Datamuse:", err.message);
    return [];
  }
}

function generateVanityOptions(phoneNumber, words) {
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
      matches.push({ vanity, word, length: wordLength });
      if (matches.length >= 5) break;
    }
  }

  return matches.sort((a, b) => b.length - a.length).map((m) => m.vanity);
}

export async function handler(event) {
  console.log("Event received:", JSON.stringify(event, null, 2));

  const rawNumber =
    event?.Details?.ContactData?.CustomerEndpoint?.Address || "0000000000";
  const phoneNumber = String(rawNumber);
  console.log("Caller number:", phoneNumber);

  const category =
    event?.Details?.ContactData?.Attributes?.Category || "general";

  console.log("Business category:", category);

  const categoryWords = await getCategoryWords(category);
  let categoryMatches = generateVanityOptions(phoneNumber, categoryWords);
  console.log("Category matches:", categoryMatches);

  let finalMatches = categoryMatches;
  let usedFallback = false;

  if (finalMatches.length === 0) {
    usedFallback = true;
  }

  if (finalMatches.length < 5) {
    const fallbackMatches = generateVanityOptions(phoneNumber, fallbackWords);
    console.log("Fallback matches:", fallbackMatches);

    finalMatches = [
      ...categoryMatches,
      ...fallbackMatches.filter((w) => !categoryMatches.includes(w)),
    ].slice(0, 5);
  }

  console.log("Final matches:", finalMatches);

  try {
    await ddb.send(
      new PutCommand({
        TableName: process.env.TABLE_NAME,
        Item: {
          callerNumber: phoneNumber,
          createdAt: new Date().toISOString(),
          topResults: finalMatches,
          categoryUsed: category,
          usedFallback,
        },
      })
    );
    console.log("Top 5 write to DynamoDB successful");
  } catch (err) {
    console.error("DynamoDB write failed:", err);
  }

  return {
    topResult1: finalMatches[0] || "",
    topResult2: finalMatches[1] || "",
    topResult3: finalMatches[2] || "",
    hasVanityResults: finalMatches.length > 0,
    usedFallback,
  };
}
