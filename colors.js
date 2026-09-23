// Fixed palette offered when picking a tag's color. Single source of
// truth — database.js imports this for migrateSpace's free-color lookup,
// and the frontend fetches it via GET /colors (tags.route.js) instead of
// keeping its own hardcoded copy. Mirrors how languages.js/GET /languages
// works for the language list.

export const COLORS = [
    '#AD1457', '#D81B60', '#E67C73', '#F4511E',
    '#F09300', '#F6BF26', '#7CB342', '#0B8043',
    '#009688', '#33B679', '#039BE5', '#3F51B5',
    '#B39DDB', '#9E69AF', '#8E24AA', '#795548'
];