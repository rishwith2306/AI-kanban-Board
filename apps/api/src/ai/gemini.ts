import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(apiKey);

// Helper to check if AI is enabled
export function isAIEnabled(): boolean {
  return apiKey !== "";
}

/**
 * 1. Infer Complexity
 */
export async function inferComplexity(
  title: string,
  description: string
): Promise<{ complexity: string; reason: string }> {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = `
      You are an expert agile project manager. Analyze the following task:
      Title: "${title}"
      Description: "${description}"

      Estimate the task complexity on a standard Story Points scale (1, 2, 3, 5, 8).
      Provide a brief plain-English explanation for your estimate (max 2 sentences).

      Return the response STRICTLY as a JSON object matching this schema:
      {
        "complexity": "1 pt" | "2 pts" | "3 pts" | "5 pts" | "8 pts",
        "reason": "explanation text"
      }
    `;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    const text = result.response.text();
    return JSON.parse(text);
  } catch (error) {
    console.error("Gemini inferComplexity error:", error);
    return {
      complexity: "3 pts",
      reason: "Defaulted to 3 pts due to AI analysis failure.",
    };
  }
}

/**
 * 2. Analyze Board State (Bottlenecks, Sprint Risks, and Auto-Assignment Suggestions)
 */
export interface BoardData {
  boardName: string;
  sprintStartDate: string | null;
  sprintEndDate: string | null;
  collaborators: { id: string; name: string }[];
  lists: {
    id: string;
    name: string;
    cards: {
      id: string;
      title: string;
      description: string;
      assigneeId: string | null;
      aiComplexityEstimate: string | null;
      createdAt: string;
    }[];
  }[];
}

export interface BoardAuditResult {
  bottlenecks: {
    columnName: string;
    count: number;
    riskLevel: "Low" | "Medium" | "High";
    likelyCause: string;
  }[];
  sprintRisk: {
    riskLevel: "Low" | "Medium" | "High";
    summary: string;
  };
  assignmentSuggestions: {
    cardId: string;
    cardTitle: string;
    suggestedAssigneeId: string;
    suggestedAssigneeName: string;
    reason: string;
  }[];
}

export async function analyzeBoardState(boardData: BoardData): Promise<BoardAuditResult> {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = `
      You are an AI Project Manager. Analyze the following Kanban board data and perform:
      1. Bottleneck detection: Identify columns with high card densities and their likely causes (e.g. overloaded assignee, label friction).
      2. Sprint Risk Assessment: Evaluate velocity and the sprint timeline (Start: ${boardData.sprintStartDate || "N/A"}, End: ${boardData.sprintEndDate || "N/A"}).
      3. Auto-assignment Suggestions: For any cards with no assignee (assigneeId is null), suggest the best collaborator by matching the task title/description with the team members' history of already-assigned or completed tasks on this board (inferring expertise/previous domain experience from other cards they are assigned to), while balancing current workload.

      Board Data:
      ${JSON.stringify(boardData, null, 2)}

      Return the analysis STRICTLY as a JSON object matching this schema:
      {
        "bottlenecks": [
          {
            "columnName": "string",
            "count": number,
            "riskLevel": "Low" | "Medium" | "High",
            "likelyCause": "string"
          }
        ],
        "sprintRisk": {
          "riskLevel": "Low" | "Medium" | "High",
          "summary": "plain-English audit report text"
        },
        "assignmentSuggestions": [
          {
            "cardId": "string",
            "cardTitle": "string",
            "suggestedAssigneeId": "string",
            "suggestedAssigneeName": "string",
            "reason": "justification text"
          }
        ]
      }
    `;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    const text = result.response.text();
    return JSON.parse(text);
  } catch (error) {
    console.error("Gemini analyzeBoardState error:", error);
    return {
      bottlenecks: [],
      sprintRisk: { riskLevel: "Low", summary: "Board analysis failed." },
      assignmentSuggestions: [],
    };
  }
}

/**
 * 3. Generate Weekly Digest (Markdown)
 */
export async function generateWeeklyDigest(
  boardData: BoardData,
  auditResult: BoardAuditResult
): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = `
      You are an AI Project Manager. Summarize the board state and recent audit logs into a clean, professional Markdown weekly digest report.
      Include sections for:
      - Board Summary (Total tasks, columns, assignee status)
      - Bottleneck alerts
      - Sprint risk summary
      - Actionable recommendations for the team

      Board Data:
      ${JSON.stringify(boardData, null, 2)}

      Audit Results:
      ${JSON.stringify(auditResult, null, 2)}

      Output only valid Markdown text.
    `;

    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error("Gemini generateWeeklyDigest error:", error);
    return `# Sprint Digest for ${boardData.boardName}\n\nFailed to compile AI weekly digest report.`;
  }
}
