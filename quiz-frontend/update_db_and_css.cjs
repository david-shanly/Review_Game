const fs = require('fs');

const quizData = {
  settings: {
    subtractOnWrong: true,
    totalQuestions: 13,
    displayMode: "QUESTION_NUMBER",
    enableTieBreaker: true,
    enableTimer: true
  },
  questions: [
    {
      id: "q1", qnIndex: 1, type: "mcq", points: 200,
      question: "Who was the king of Babylon when Daniel was taken into captivity?",
      options: ["King David", "King Cyrus", "King Nebuchadnezzar", "King Saul"],
      answer: "King Nebuchadnezzar"
    },
    {
      id: "q2", qnIndex: 2, type: "mcq", points: 300,
      question: "Who was the chief officer who brought the young men of Judah into the palace?",
      options: ["Daniel", "Ashpenaz", "Abednego", "E Ezekiel"],
      answer: "Ashpenaz"
    },
    {
      id: "q3", qnIndex: 3, type: "mcq", points: 200,
      question: "What was the right choice Daniel and his friends made?",
      options: ["To join idol worship", "To honor God and avoid sin", "To run away from Babylon", "To become soldiers"],
      answer: "To honor God and avoid sin"
    },
    {
      id: "q4", qnIndex: 4, type: "mcq", points: 300,
      question: "How did Daniel and his friends overcome temptation?",
      options: ["By fighting their enemies", "By trusting God", "By hiding from the king", "By ignoring their beliefs"],
      answer: "By trusting God"
    },
    {
      id: "q5", qnIndex: 5, type: "mcq", points: 400,
      question: "Why was eating the king’s food a problem?",
      options: ["It was too expensive", "It was not tasty", "It was offered to idols and unclean according to Jewish law", "It was vegetarian"],
      answer: "It was offered to idols and unclean according to Jewish law"
    },
    {
      id: "q6", qnIndex: 6, type: "fill_blank", points: 200,
      question: "Psalms 25:12 — “Who is the man that ______? Him shall He teach in the way He chooses.”",
      answer: "fears the LORD"
    },
    {
      id: "q7", qnIndex: 7, type: "fill_blank", points: 300,
      question: "Who got the name Abednego? ______",
      answer: "Azariah"
    },
    {
      id: "q8", qnIndex: 8, type: "fill_blank", points: 200,
      question: "How many days did Daniel request to be tested with vegetables and water? ______",
      answer: "10 days"
    },
    {
      id: "q9", qnIndex: 9, type: "fill_blank", points: 300,
      question: "How long were Daniel and his friends trained before serving the king? ______",
      answer: "3 years"
    },
    {
      id: "q10", qnIndex: 10, type: "short_answer", points: 500,
      question: "Why did God allow His people to be taken into Babylon captivity?",
      answer: "Because the Israelites disobeyed God and worshipped idols, so God allowed captivity as discipline."
    },
    {
      id: "q11", qnIndex: 11, type: "short_answer", points: 600,
      question: "What happened when Daniel and his friends refused the king’s food?",
      answer: "They looked healthier and better nourished than all the others who ate the king’s food."
    },
    {
      id: "q12", qnIndex: 12, type: "short_answer", points: 600,
      question: "How did God reward Daniel and his friends for their obedience?",
      answer: "God gave them wisdom, understanding, health, and high positions in Babylon. Daniel also received the ability to understand dreams and visions."
    },
    {
      id: "q13", qnIndex: 13, type: "long_answer", points: 800,
      question: "Explain the life choices of Daniel and his friends in Babylon and how God helped them because of their faithfulness.",
      answer: "Daniel and his friends chose to remain faithful to God by refusing to defile themselves with the king’s food and by living according to God’s commands. Because of their obedience, God blessed them with wisdom, strength, favor, and high positions in Babylon. God also gave Daniel special understanding of dreams and visions, showing that He rewards those who remain faithful."
    },
    {
      id: "tiebreaker", qnIndex: "tiebreaker", type: "short_answer", points: 1000,
      question: "What is the reward God has promised to those who overcome temptation?",
      answer: "Crown of Life"
    }
  ]
};

fs.writeFileSync('public/default_quiz.json', JSON.stringify(quizData, null, 2));

// Update style.css
let styleCss = fs.readFileSync('style.css', 'utf8');

// Increase modal width from 1144px to 1400px
styleCss = styleCss.replace(
  /\.modal-content \{\s*width: 100%;\s*max-width: 1144px;/,
  '.modal-content {\n  width: 100%;\n  max-width: 1400px;'
);

// Fix reveal-value to wrap text and scale font
styleCss = styleCss.replace(
  /\.reveal-value \{\s*font-family: var\(--font-display\);\s*font-size: 2rem;\s*\}/,
  '.reveal-value {\n  font-family: var(--font-display);\n  font-size: clamp(1.2rem, 3vw, 2rem);\n  white-space: pre-wrap;\n  word-wrap: break-word;\n  line-height: 1.4;\n}'
);

fs.writeFileSync('style.css', styleCss);
