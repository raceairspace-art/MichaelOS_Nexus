import { z } from "zod";

export const maxDuration = 30;

const symbols = ["AAPL","MSFT","NVDA","AMZN","META","GOOGL","TSLA"] as const;

const reviewSchema = z.object({
  symbol: z.enum(symbols),
  review: z.object({
    stateClassification: z.string(), locationClassification: z.string(), boxStatus: z.string(),
    stateQuality: z.number(), locationQuality: z.number(), premarketContextQuality: z.number(),
    spaceQuality: z.number(), riskQuality: z.number(), overallQuality: z.number(),
    oliverInterest: z.enum(["Yes","Maybe","No"]), wouldTrade: z.enum(["Yes","Maybe","No"]),
    direction: z.enum(["Long","Short","None / unclear"]), setupType: z.string(),
    overallGrade: z.enum(["A+","A","B","C","Reject"]), confidence: z.number(),
    strongestReason: z.string(), biggestConcern: z.string(),
    rationale: z.object({ overall: z.string() }).passthrough(),
  }).passthrough(),
});

const requestSchema = z.object({
  sessionDate: z.string(),
  timeframe: z.enum(["1m","5m","15m"]),
  modelVersion: z.string(),
  reviews: z.array(reviewSchema).length(7),
});

const resultSchema = z.object({
  bestSymbol: z.enum([...symbols,"NO_TRADE"] as const),
  secondSymbol: z.enum([...symbols,"NO_TRADE"] as const),
  noTradeDay: z.boolean(),
  winnerReason: z.string(),
  separationReason: z.string(),
  confidence: z.number().int().min(1).max(5),
});

const jsonSchema = {
  type:"object", additionalProperties:false,
  required:["bestSymbol","secondSymbol","noTradeDay","winnerReason","separationReason","confidence"],
  properties:{
    bestSymbol:{type:"string",enum:[...symbols,"NO_TRADE"]},
    secondSymbol:{type:"string",enum:[...symbols,"NO_TRADE"]},
    noTradeDay:{type:"boolean"}, winnerReason:{type:"string"}, separationReason:{type:"string"},
    confidence:{type:"integer",minimum:1,maximum:5},
  },
} as const;

function outputText(data:any){
  if(typeof data.output_text==="string") return data.output_text;
  return (data.output??[]).flatMap((item:any)=>item.content??[]).map((part:any)=>part.text??"").join("");
}

export async function POST(request:Request){
  try{
    const parsed=requestSchema.safeParse(await request.json());
    if(!parsed.success) return Response.json({error:"Daily ranking requires seven completed AI reviews."},{status:400});
    const apiKey=process.env.OPENAI_API_KEY;
    if(!apiKey) return Response.json({error:"OPENAI_API_KEY is not configured."},{status:503});
    const input=parsed.data;
    const response=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},
      body:JSON.stringify({
        model:process.env.OPENAI_TEXT_MODEL||"gpt-5", store:false,
        instructions:[
          "You are Nexus making the daily comparative ranking for Digital Oliver.",
          "All seven supplied reviews are frozen decision-time assessments. No outcome or future-day information is available or permitted.",
          "Compare the seven symbols as Oliver would around the market open. Choose the single best actionable trade and second-best trade, or NO_TRADE when the day lacks a sufficiently strong setup.",
          "Do not simply sort by one numeric field. Weigh the Oliver hierarchy State → Location → Structure Box → Space → Power → Risk, tradeability, grade, confidence, and the stated concerns.",
          "If noTradeDay is true, bestSymbol and secondSymbol must both be NO_TRADE.",
          "Explain why the winner separates from the rest and especially from the runner-up.",
        ].join("\n"),
        input:JSON.stringify(input),
        text:{format:{type:"json_schema",name:"digital_oliver_daily_rank",strict:true,schema:jsonSchema}},
      }),
    });
    if(!response.ok){const detail=await response.text();console.error("Oliver AI daily rank failed",response.status,detail);return Response.json({error:"Nexus could not rank the seven Oliver cases."},{status:502});}
    const data=await response.json();
    let json:unknown;try{json=JSON.parse(outputText(data))}catch{return Response.json({error:"Nexus returned an unreadable daily ranking."},{status:502})}
    const rank=resultSchema.safeParse(json);if(!rank.success)return Response.json({error:"Nexus returned an incomplete daily ranking."},{status:502});
    return Response.json({ranking:{...rank.data,generatedAt:new Date().toISOString(),model:data.model||process.env.OPENAI_TEXT_MODEL||"gpt-5",modelVersion:input.modelVersion,timeframe:input.timeframe}});
  }catch(error){console.error("Oliver AI daily rank route failed",error);return Response.json({error:"Nexus could not rank the seven Oliver cases."},{status:500});}
}
