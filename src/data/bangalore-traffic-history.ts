/**
 * Aggregated from the "Bangalore's Traffic Pulse" Kaggle dataset
 * (https://www.kaggle.com/datasets/preethamgouda/banglore-city-traffic-dataset),
 * 8,936 daily records (2022) across 8 Bengaluru areas. Raw CSV lives at
 * src/data/bangalore_traffic_pulse.csv. Aggregation: mean/max Traffic Volume,
 * mean Average Speed and Congestion Level, mean Traffic Volume per weekday
 * (Mon..Sun), and the single busiest recorded road, grouped by Area Name.
 */
export type AreaTrafficHistory = {
  areaName: string;
  records: number;
  avgVolume: number;
  maxVolume: number;
  avgSpeedKph: number;
  avgCongestionPct: number;
  /** Mean traffic volume by weekday, Monday through Sunday. */
  weekdayAvgVolume: [number, number, number, number, number, number, number];
  /** Road/intersection with the single highest recorded Traffic Volume in this area. */
  busiestRoad: string;
};

const measuredAreas: Record<string, AreaTrafficHistory> = {
  indiranagar: {
    areaName: "Indiranagar",
    records: 1720,
    avgVolume: 32284,
    maxVolume: 61638,
    avgSpeedKph: 38.6,
    avgCongestionPct: 87.6,
    weekdayAvgVolume: [32463, 32475, 33078, 32326, 32059, 32053, 31544],
    busiestRoad: "CMH Road",
  },
  whitefield: {
    areaName: "Whitefield",
    records: 942,
    avgVolume: 21295,
    maxVolume: 41527,
    avgSpeedKph: 42.1,
    avgCongestionPct: 69.1,
    weekdayAvgVolume: [21600, 22333, 21162, 20718, 21166, 20232, 21983],
    busiestRoad: "Marathahalli Bridge",
  },
  koramangala: {
    areaName: "Koramangala",
    records: 1364,
    avgVolume: 40832,
    maxVolume: 72039,
    avgSpeedKph: 36.1,
    avgCongestionPct: 94.0,
    weekdayAvgVolume: [40624, 40847, 41198, 41495, 39994, 41046, 40602],
    busiestRoad: "Sony World Junction",
  },
  "mg-road": {
    areaName: "M.G. Road",
    records: 1501,
    avgVolume: 35300,
    maxVolume: 63390,
    avgSpeedKph: 37.5,
    avgCongestionPct: 90.6,
    weekdayAvgVolume: [36504, 33293, 35342, 36880, 35492, 35157, 34426],
    busiestRoad: "Anil Kumble Circle",
  },
  jayanagar: {
    areaName: "Jayanagar",
    records: 1173,
    avgVolume: 24601,
    maxVolume: 47068,
    avgSpeedKph: 39.8,
    avgCongestionPct: 77.0,
    weekdayAvgVolume: [24429, 24363, 24999, 24452, 24370, 25277, 24327],
    busiestRoad: "South End Circle",
  },
  hebbal: {
    areaName: "Hebbal",
    records: 950,
    avgVolume: 26533,
    maxVolume: 49783,
    avgSpeedKph: 40.1,
    avgCongestionPct: 80.1,
    weekdayAvgVolume: [25388, 27747, 27300, 27466, 26560, 25517, 25732],
    busiestRoad: "Ballari Road",
  },
  yeshwanthpur: {
    areaName: "Yeshwanthpur",
    records: 734,
    avgVolume: 18932,
    maxVolume: 38877,
    avgSpeedKph: 43.4,
    avgCongestionPct: 62.4,
    weekdayAvgVolume: [18213, 18455, 18218, 18695, 19162, 19583, 20275],
    busiestRoad: "Yeshwanthpur Circle",
  },
  "electronic-city": {
    areaName: "Electronic City",
    records: 552,
    avgVolume: 16347,
    maxVolume: 33855,
    avgSpeedKph: 43.7,
    avgCongestionPct: 54.5,
    weekdayAvgVolume: [17153, 15972, 16181, 16760, 15058, 16623, 17101],
    busiestRoad: "Hosur Road",
  },
};

function round(value: number, decimals = 0) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Citywide rollup, averaged across all 8 measured areas — registered as "bengaluru". */
function buildCitywideAverage(): AreaTrafficHistory {
  const areas = Object.values(measuredAreas);
  const mean = (pick: (a: AreaTrafficHistory) => number) =>
    areas.reduce((sum, a) => sum + pick(a), 0) / areas.length;

  const weekdayAvgVolume = [0, 1, 2, 3, 4, 5, 6].map((day) =>
    Math.round(mean((a) => a.weekdayAvgVolume[day] ?? 0)),
  ) as AreaTrafficHistory["weekdayAvgVolume"];

  const busiest = areas.reduce((max, a) => (a.maxVolume > max.maxVolume ? a : max));

  return {
    areaName: "Bengaluru",
    records: areas.reduce((sum, a) => sum + a.records, 0),
    avgVolume: Math.round(mean((a) => a.avgVolume)),
    maxVolume: Math.round(mean((a) => a.maxVolume)),
    avgSpeedKph: round(
      mean((a) => a.avgSpeedKph),
      1,
    ),
    avgCongestionPct: round(
      mean((a) => a.avgCongestionPct),
      1,
    ),
    weekdayAvgVolume,
    busiestRoad: `${busiest.busiestRoad}, ${busiest.areaName}`,
  };
}

export const bangaloreTrafficHistory: Record<string, AreaTrafficHistory> = {
  ...measuredAreas,
  bengaluru: buildCitywideAverage(),
};
