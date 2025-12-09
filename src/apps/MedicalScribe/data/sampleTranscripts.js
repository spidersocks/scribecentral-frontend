// src/apps/MedicalScribe/data/sampleTranscripts.js

export const LANGUAGE_LABELS = {
  "en-US": "English (United States)",
  "zh-HK": "Cantonese (粵語)",
  "zh-TW": "Mandarin Traditional (國語)",
};

export const SAMPLE_TRANSCRIPTS = [
  {
    id: "stable-angina-en",
    name: "Cardiology Follow-up (English)",
    description:
      "Outpatient review after exertional chest tightness with updated beta-blocker plan and diagnostics.",
    language: "en-US",
    speakerRoles: {
      spk_0: "Clinician",
      spk_1: "Patient",
    },
    patientProfile: {
      name: "Mei Chen",
      sex: "Female",
      referringPhysician: "Dr. Patel",
    },
    segments: [
      {
        id: "ang-1",
        speaker: "spk_0",
        text: "Good morning, Ms. Chen. How have you been feeling since your last visit?",
        entities: [
          {
            Text: "Chen",
            Category: "PROTECTED_HEALTH_INFORMATION",
            Type: "NAME",
            Score: 0.9997178912162781,
            BeginOffset: 18,
            EndOffset: 22,
          },
        ],
      },
      {
        id: "ang-2",
        speaker: "spk_1",
        text: "I've had some tightness in my chest when I climb stairs, but it goes away when I rest.",
        entities: [
          {
            Text: "tightness",
            Category: "MEDICAL_CONDITION",
            Type: "DX_NAME",
            Score: 0.9201511740684509,
            BeginOffset: 14,
            EndOffset: 23,
          },
          {
            Text: "chest",
            Category: "ANATOMY",
            Type: "SYSTEM_ORGAN_SITE",
            Score: 0.821601390838623,
            BeginOffset: 30,
            EndOffset: 35,
          },
          {
            Text: "when I climb stairs",
            Category: "MEDICAL_CONDITION",
            Type: "QUALITY",
            Score: 0.6603351831436157,
            BeginOffset: 36,
            EndOffset: 55,
          },
          {
            Text: "goes away when I rest",
            Category: "MEDICAL_CONDITION",
            Type: "QUALITY",
            Score: 0.5971075296401978,
            BeginOffset: 64,
            EndOffset: 85,
          },
        ],
      },
      {
        id: "ang-3",
        speaker: "spk_0",
        text: "Any dizziness or shortness of breath when that happens?",
        entities: [
          {
            Text: "dizziness",
            Category: "MEDICAL_CONDITION",
            Type: "DX_NAME",
            Score: 0.9201511740684509,
            BeginOffset: 4,
            EndOffset: 13,
          },
          {
            Text: "shortness of breath",
            Category: "MEDICAL_CONDITION",
            Type: "DX_NAME",
            Score: 0.9584784507751465,
            BeginOffset: 17,
            EndOffset: 36,
          },
        ],
      },
      {
        id: "ang-4",
        speaker: "spk_1",
        text: "A little short of breath, but no dizziness.",
        entities: [
          {
            Text: "short of breath",
            Category: "MEDICAL_CONDITION",
            Type: "DX_NAME",
            Score: 0.9350614547729492,
            BeginOffset: 9,
            EndOffset: 24,
          },
          {
            Text: "dizziness",
            Category: "MEDICAL_CONDITION",
            Type: "DX_NAME",
            Score: 0.9350614547729492,
            BeginOffset: 33,
            EndOffset: 42,
          },
        ],
      },
      {
        id: "ang-5",
        speaker: "spk_0",
        text: "I'd like to increase your metoprolol to 50 mg twice daily and order a stress echocardiogram.",
        entities: [
          {
            Text: "metoprolol",
            Category: "MEDICATION",
            Type: "GENERIC_NAME",
            Score: 0.7950295805931091,
            BeginOffset: 26,
            EndOffset: 36,
          },
          {
            Text: "50 mg",
            Category: "MEDICATION",
            Type: "DOSAGE",
            Score: 0.821601390838623,
            BeginOffset: 40,
            EndOffset: 45,
          },
          {
            Text: "twice daily",
            Category: "MEDICATION",
            Type: "FREQUENCY",
            Score: 0.8921527862548828,
            BeginOffset: 46,
            EndOffset: 56,
          },
          {
            Text: "stress echocardiogram",
            Category: "TEST_TREATMENT_PROCEDURE",
            Type: "TEST_NAME",
            Score: 0.6603351831436157,
            BeginOffset: 70,
            EndOffset: 91,
          },
        ],
      },
      {
        id: "ang-6",
        speaker: "spk_0",
        text: "We'll also schedule a stress test if the symptoms persist after the medication change.",
        entities: [
          {
            Text: "stress test",
            Category: "TEST_TREATMENT_PROCEDURE",
            Type: "TEST_NAME",
            Score: 0.7950295805931091,
            BeginOffset: 22,
            EndOffset: 33,
          },
          {
            Text: "symptoms",
            Category: "MEDICAL_CONDITION",
            Type: "DX_NAME",
            Score: 0.877546489238739,
            BeginOffset: 41,
            EndOffset: 49,
          },
          {
            Text: "persist",
            Category: "MEDICAL_CONDITION",
            Type: "QUALITY",
            Score: 0.877546489238739,
            BeginOffset: 52,
            EndOffset: 58,
          },
          {
            Text: "medication",
            Category: "TEST_TREATMENT_PROCEDURE",
            Type: "TREATMENT_NAME",
            Score: 0.5330596566200256,
            BeginOffset: 68,
            EndOffset: 77,
          },
        ],
      },
      {
        id: "ang-7",
        speaker: "spk_1",
        text: "Thank you, doctor. I'll be careful with exertion and track any chest discomfort.",
        entities: [
          {
            Text: "chest",
            Category: "ANATOMY",
            Type: "SYSTEM_ORGAN_SITE",
            Score: 0.5971075296401978,
            BeginOffset: 63,
            EndOffset: 68,
          },
          {
            Text: "chest discomfort",
            Category: "MEDICAL_CONDITION",
            Type: "DX_NAME",
            Score: 0.877546489238739,
            BeginOffset: 63,
            EndOffset: 79,
          },
        ],
      },
    ],
  },
  {
    id: "dm-annual-zh",
    name: "糖尿病覆診：雙語 (Cantonese / English)",
    description:
      "Cantonese-led diabetes visit with English summaries, lifestyle coaching, and bilingual documentation cues.",
    language: "zh-HK",
    speakerRoles: {
      spk_0: "Clinician",
      spk_1: "Patient",
    },
    patientProfile: {
      name: "吳太 (Mrs. Ng)",
      sex: "Female",
      additionalContext:
        "Type 2 DM, HTN. Prefers Cantonese with English highlights and app-based monitoring.",
    },
    segments: [
      {
        id: "hk-1",
        speaker: "spk_0",
        text: "吳太，今次覆診你最近血糖點樣？",
        displayText: "吳太，今次覆診你最近血糖點樣？",
        translatedText:
          "Mrs. Ng, how have your glucose readings been lately?",
        entities: [
          {
            Text: "Ng",
            Category: "PROTECTED_HEALTH_INFORMATION",
            Type: "NAME",
            Score: 0.29859820008277893,
            BeginOffset: 5,
            EndOffset: 7,
          },
          {
            Text: "glucose",
            Category: "TEST_TREATMENT_PROCEDURE",
            Type: "TEST_NAME",
            Score: 0.7172441482543945,
            BeginOffset: 23,
            EndOffset: 30,
          },
        ],
      },
      {
        id: "hk-2",
        speaker: "spk_1",
        text: "醫生，我最近有啲攰，同埋有兩次餐前血糖高過一百五十。",
        displayText:
          "醫生，我最近有啲攰，同埋有兩次餐前血糖高過一百五十。",
        translatedText:
          "Doctor, I've been a bit tired and twice my pre-meal glucose was over 150.",
        entities: [
          {
            Text: "tired",
            Category: "MEDICAL_CONDITION",
            Type: "DX_NAME",
            Score: 0.9201511740684509,
            BeginOffset: 24,
            EndOffset: 29,
          },
          {
            Text: "glucose",
            Category: "TEST_TREATMENT_PROCEDURE",
            Type: "TEST_NAME",
            Score: 0.5971075296401978,
            BeginOffset: 52,
            EndOffset: 59,
          },
          {
            Text: "over 150",
            Category: "TEST_TREATMENT_PROCEDURE",
            Type: "TEST_VALUE",
            Score: 0.7613970637321472,
            BeginOffset: 64,
            EndOffset: 72,
          },
        ],
      },
      {
        id: "hk-3",
        speaker: "spk_0",
        text: "我哋會繼續用 metformin，仲希望你晚飯後行十五分鐘。記得 upload readings to the app。",
        displayText:
          "我哋會繼續用 metformin，仲希望你晚飯後行十五分鐘。記得 upload readings to the app。",
        translatedText:
          "We'll keep you on metformin, walk fifteen minutes after dinner, and upload readings to the app.",
        entities: [
          {
            Text: "metformin",
            Category: "MEDICATION",
            Type: "GENERIC_NAME",
            Score: 0.7172441482543945,
            BeginOffset: 18,
            EndOffset: 27,
          },
          {
            Text: "walk fifteen minutes after dinner",
            Category: "TEST_TREATMENT_PROCEDURE",
            Type: "TREATMENT_NAME",
            Score: 0.5330596566200256,
            BeginOffset: 29,
            EndOffset: 62,
          },
        ],
      },
      {
        id: "hk-4",
        speaker: "spk_1",
        text: "多謝你醫生，我會試下記錄食咩同埋做多啲 walking。",
        displayText: "多謝你醫生，我會試下記錄食咩同埋做多啲 walking。",
        translatedText:
          "Thanks doctor, I'll track my meals and do more walking.",
        entities: [
          {
            Text: "do more walking",
            Category: "TEST_TREATMENT_PROCEDURE",
            Type: "TREATMENT_NAME",
            Score: 0.5330596566200256,
            BeginOffset: 39,
            EndOffset: 54,
          },
        ],
      },
      {
        id: "hk-5",
        speaker: "spk_0",
        text: "我會傳一段廣東話糖尿病影片俾你，再幫你約下個月抽血。",
        displayText: "我會傳一段廣東話糖尿病影片俾你，再幫你約下個月抽血。",
        translatedText:
          "I'll send you a Cantonese diabetes education video and schedule labs for next month.",
        entities: [
          {
            Text: "labs",
            Category: "TEST_TREATMENT_PROCEDURE",
            Type: "TEST_NAME",
            Score: 0.7172441482543945,
            BeginOffset: 64,
            EndOffset: 68,
          },
          {
            Text: "next month",
            Category: "TIME_EXPRESSION",
            Type: "TIME_TO_TEST_NAME",
            Score: 0.7950295805931091,
            BeginOffset: 73,
            EndOffset: 83,
          },
        ],
      },
      {
        id: "hk-6",
        speaker: "spk_1",
        text: "好，多謝晒。",
        displayText: "好，多謝晒。",
        translatedText: "Okay, thank you.",
        entities: [],
      },
    ],
  },
  {
    id: "asthma-followup-en",
    name: "Asthma Exacerbation Follow-up (English)",
    description:
      "Primary care recheck after urgent care visit for asthma symptoms, focusing on controller and rescue therapy.",
    language: "en-US",
    speakerRoles: {
      spk_0: "Clinician",
      spk_1: "Patient",
    },
    patientProfile: {
      name: "Daniel Wong",
      sex: "Male",
      referringPhysician: "Dr. Lee",
    },
    segments: [
      {
        id: "asth-1",
        speaker: "spk_0",
        text: "Hi Daniel, I saw you were in urgent care last week for asthma symptoms. How are you breathing today?",
        entities: [
          {
            Text: "Daniel",
            Category: "PROTECTED_HEALTH_INFORMATION",
            Type: "NAME",
            Score: 0.9863996505737305,
            BeginOffset: 3,
            EndOffset: 9,
          },
          {
            Text: "last week",
            Category: "TIME_EXPRESSION",
            Type: "TIME_TO_DX_NAME",
            Score: 0.6603351831436157,
            BeginOffset: 41,
            EndOffset: 50,
          },
          {
            Text: "asthma symptoms",
            Category: "MEDICAL_CONDITION",
            Type: "DX_NAME",
            Score: 0.8617406487464905,
            BeginOffset: 55,
            EndOffset: 70,
          },
          {
            Text: "breathing",
            Category: "MEDICAL_CONDITION",
            Type: "DX_NAME",
            Score: 0.8435389995574951,
            BeginOffset: 84,
            EndOffset: 93,
          },
          {
            Text: "today",
            Category: "TIME_EXPRESSION",
            Type: "TIME_TO_DX_NAME",
            Score: 0.5971075296401978,
            BeginOffset: 94,
            EndOffset: 99,
          },
        ],
      },
      {
        id: "asth-2",
        speaker: "spk_1",
        text: "Still a bit tight, especially in the evenings, but the rescue inhaler helps.",
        entities: [
          {
            Text: "in the evenings",
            Category: "TIME_EXPRESSION",
            Type: "TIME_TO_DX_NAME",
            Score: 0.5330596566200256,
            BeginOffset: 30,
            EndOffset: 45,
          },
          {
            Text: "rescue inhaler",
            Category: "TEST_TREATMENT_PROCEDURE",
            Type: "TREATMENT_NAME",
            Score: 0.6603351831436157,
            BeginOffset: 55,
            EndOffset: 69,
          },
        ],
      },
      {
        id: "asth-3",
        speaker: "spk_0",
        text: "How often are you using the albuterol this week?",
        entities: [
          {
            Text: "albuterol",
            Category: "MEDICATION",
            Type: "GENERIC_NAME",
            Score: 0.7172441482543945,
            BeginOffset: 28,
            EndOffset: 37,
          },
          {
            Text: "this week",
            Category: "TIME_EXPRESSION",
            Type: "TIME_TO_MEDICATION",
            Score: 0.5330596566200256,
            BeginOffset: 38,
            EndOffset: 47,
          },
        ],
      },
      {
        id: "asth-4",
        speaker: "spk_1",
        text: "Maybe twice a day, mostly before I leave work.",
        entities: [
          {
            Text: "twice a day",
            Category: "MEDICATION",
            Type: "FREQUENCY",
            Score: 0.5971075296401978,
            BeginOffset: 6,
            EndOffset: 17,
          },
        ],
      },
      {
        id: "asth-5",
        speaker: "spk_0",
        text: "Keep a symptom log and let's add a nightly budesonide inhaler for the next two weeks.",
        entities: [
          {
            Text: "nightly",
            Category: "MEDICATION",
            Type: "FREQUENCY",
            Score: 0.5330596566200256,
            BeginOffset: 35,
            EndOffset: 42,
          },
          {
            Text: "budesonide",
            Category: "MEDICATION",
            Type: "GENERIC_NAME",
            Score: 0.7950295805931091,
            BeginOffset: 43,
            EndOffset: 54,
          },
          {
            Text: "inhaler",
            Category: "MEDICATION",
            Type: "FORM",
            Score: 0.5330596566200256,
            BeginOffset: 54,
            EndOffset: 61,
          },
          {
            Text: "next two weeks",
            Category: "MEDICATION",
            Type: "DURATION",
            Score: 0.5971075296401978,
            BeginOffset: 70,
            EndOffset: 84,
          },
        ],
      },
      {
        id: "asth-6",
        speaker: "spk_1",
        text: "Sounds good, I'll jot it down and message you if I need the prednisone again.",
        entities: [
          {
            Text: "prednisone",
            Category: "MEDICATION",
            Type: "GENERIC_NAME",
            Score: 0.7950295805931091,
            BeginOffset: 60,
            EndOffset: 70,
          },
        ],
      },
    ],
  },
];

export function getSampleTranscriptById(sampleId) {
  return SAMPLE_TRANSCRIPTS.find((sample) => sample.id === sampleId) ?? null;
}