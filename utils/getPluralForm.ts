export default (count: number, titles: [string, string, string]) => {
  if (count % 10 === 1 && count % 100 !== 11) {
    return titles[0];
  }

  if (count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 10 || count % 100 >= 20)) {
    return titles[1];
  }

  return titles[2];
};
