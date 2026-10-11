export interface Response {
  result: string;
  hubs?: { hubName: string; serialNo: string; apiKey: string }[];
}
