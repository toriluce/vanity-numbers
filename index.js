import fs from "fs";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { PutCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import wordListPath from "word-list";
import dotenv from "dotenv";

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

const wordList = rawWordList
  .map((word) => word.toUpperCase())
  .filter(
    (word) => /^[A-Z]+$/.test(word) && word.length >= 3 && word.length <= 7
  );

function generateVanityOptions(phoneNumber, wordList) {
  let digits = phoneNumber.replace(/\D/g, "");
  const matches = [];

  for (let word of wordList) {
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
    if (matches.length >= 5) break;
  }

  return matches.sort((a, b) => b.length - a.length).map((m) => m.vanity);
}

export async function handler(event) {
  console.log("Event received:", JSON.stringify(event, null, 2));

  const rawNumber = event?.Details?.Parameters?.phoneNumber || "+10000000000";
  const phoneNumber = String(rawNumber);
  console.log("Caller number:", phoneNumber);

  const vanityOptions = generateVanityOptions(phoneNumber, wordList);

  try {
    await ddb.send(
      new PutCommand({
        TableName: process.env.TABLE_NAME,
        Item: {
          callerNumber: phoneNumber,
          createdAt: new Date().toISOString(),
          topResults: vanityOptions,
        },
      })
    );
    console.log("DynamoDB write successful");
  } catch (err) {
    console.error("DynamoDB write failed:", err);
  }

  return {
    topResult1: vanityOptions[0] || "",
    topResult2: vanityOptions[1] || "",
    topResult3: vanityOptions[2] || "",
    hasVanityResults: vanityOptions.length > 0,
  };
}
