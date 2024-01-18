const mysql = require('mysql');

// Конфигурация подключения к базе данных
const db = mysql.createConnection({
  host: 'localhost', // Адрес хоста базы данных
  user: 'root', // Имя пользователя базы данных
  password: '', // Пароль пользователя базы данных
  database: 'emp-system' // Имя базы данных
});

// Установка соединения с базой данных
db.connect((err) => {
  if (err) {
    console.error('Ошибка подключения к базе данных:', err);
  } else {
    console.log('Успешное подключение к базе данных');
  }
});

db.on('error', (err) => {
  console.error('Ошибка базы данных:', err);
  if (err.code === 'PROTOCOL_CONNECTION_LOST') {
    // Переподключаемся, если соединение было утеряно
    db.connect();
  } else {
    throw err;
  }
});

// Закрытие соединения с базой данных при завершении работы приложения
process.on('SIGINT', () => {
  db.end((err) => {
    if (err) {
      console.error('Ошибка закрытия соединения с базой данных:', err);
    } else {
      console.log('Соединение с базой данных закрыто');
    }
    process.exit();
  });
});

module.exports = db;