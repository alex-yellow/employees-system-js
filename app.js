const express = require('express');
const db = require('./db');
const expressHandlebars = require('express-handlebars');
const handlebarsHelpers = require('handlebars-helpers')();
const session = require('express-session');
const flash = require('express-flash');
const bcrypt = require('bcrypt');

const handlebars = expressHandlebars.create({
  defaultLayout: 'main',
  extname: 'hbs',
  helpers: {
    eq: handlebarsHelpers.eq,
  },
});

const app = express();
app.use(express.urlencoded({ extended: true }));
app.engine('hbs', handlebars.engine);
app.set('view engine', 'hbs');
app.use(express.static('public'));

const Handlebars = require('handlebars');
const paginate = require('handlebars-paginate');

// Регистрация хелпера handlebars-paginate
Handlebars.registerHelper('paginate', paginate);

app.use(
  session({
    secret: 'key',
    resave: false,
    saveUninitialized: false,
  })
);

// Используем express-flash
app.use(flash());

// Добавляем middleware для передачи флеш-сообщений в res.locals
app.use((req, res, next) => {
  res.locals.success_messages = req.flash('success');
  next();
});

// Функция для проверки аутентификации пользователя
function checkUserAuthentication(req, res, next) {
  const user = req.session.user;

  if (!user) {
    return res.redirect('/login');
  }

  req.user = user;
  next();
}


// Маршрут для главной страницы
app.get('/', (req, res) => {
  res.render('auth/index', { session: req.session, title:'Employee Management System' });
});

// Маршрут для отображения страницы регистрации
app.get('/register', (req, res) => {
  res.render('auth/register', { session: req.session, error_message: req.flash('error')[0], title:'Register' });
});

// Маршрут для логики регистрации
app.post('/register', async (req, res) => {
  const { name, password, admin } = req.body;

  if (!name || !password) {
    req.flash('error', 'Name and password are required');
    return res.redirect('/auth/register');
  }

  try {
    // Хеширование пароля
    const hashedPassword = await bcrypt.hash(password, 10);

    // SQL-запрос для добавления пользователя в базу данных
    const addUserSql = 'INSERT INTO users (name, password, is_admin) VALUES (?, ?, ?)';
    const addUserValues = [name, hashedPassword, admin === 'true'];

    db.query(addUserSql, addUserValues, (err, result) => {
      if (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          // Дублирование уникального ключа (пользователь с таким именем уже существует)
          req.flash('error', 'User with this name already exists');
        } else {
          console.error('Registration error:', err);
          req.flash('error', 'Internal Server Error');
        }
        return res.redirect('/auth/register');
      }

      req.session.success_message = 'Registration successful!';
      res.redirect('/auth/login');
    });
  } catch (error) {
    console.error('Registration error:', error);
    req.flash('error', 'Internal Server Error');
    res.redirect('/auth/register');
  }
});

// Маршрут для отображения страницы входа
app.get('/login', (req, res) => {
  res.render('auth/login', { session: req.session, success_message: req.session.success_message, title:'Login' });
  // Очищаем сообщение после его использования
  req.session.success_message = null;
});

// Маршрут для логики входа
app.post('/login', async (req, res) => {
  const { name, password } = req.body;

  if (!name || !password) {
    req.flash('error', 'Name and password are required');
    return res.redirect('/login');
  }

  try {
    // SQL-запрос для поиска пользователя по имени
    const findUserSql = 'SELECT * FROM users WHERE name = ? LIMIT 1';
    const findUserValues = [name];

    db.query(findUserSql, findUserValues, async (err, results) => {
      if (err) {
        console.error('Login error:', err);
        req.flash('error', 'Internal Server Error');
        return res.redirect('/login');
      }

      // Пользователь найден
      if (results.length > 0) {
        const user = results[0];

        // Проверка пароля
        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (isPasswordValid) {
          // Аутентификация успешна
          req.session.user = user;
          req.flash('success', 'Welcome!');
          return res.redirect('/');
        }
      }

      // Неверные учетные данные
      req.flash('error', 'Incorrect name or password');
      res.render('auth/login', { session: req.session, error_message: req.flash('error')[0] });
    });
  } catch (error) {
    console.error('Login error:', error);
    req.flash('error', 'Internal Server Error');
    res.redirect('/login');
  }
});

// Маршрут для логики выхода
app.get('/logout', (req, res) => {
  // Удаление пользователя из сессии
  req.session.user = null;
  req.flash('success', 'You have been logged out successfully');
  res.redirect('/');
});

// Маршрут для отображения списка работников
app.get('/employees', (req, res) => {
  const getDepartmentsSql = 'SELECT * FROM departments';
  const getProfessionsSql = 'SELECT * FROM professions';
  let getEmployeesSql = 'SELECT * FROM employees WHERE 1';
  const queryParams = [];

  if (req.query.department_id) {
    getEmployeesSql += ' AND department_id = ?';
    queryParams.push(req.query.department_id);
  }

  if (req.query.profession_id) {
    getEmployeesSql += ' AND profession_id = ?';
    queryParams.push(req.query.profession_id);
  }

  if (req.query.search) {
    getEmployeesSql += ' AND name LIKE ?';
    queryParams.push(`%${req.query.search}%`);
  }

  db.query(getDepartmentsSql, (errDepartments, departments) => {
    if (errDepartments) {
      console.error('Error fetching departments:', errDepartments);
      res.status(500).send('Internal Server Error');
      return;
    }

    db.query(getProfessionsSql, (errProfessions, professions) => {
      if (errProfessions) {
        console.error('Error fetching professions:', errProfessions);
        res.status(500).send('Internal Server Error');
        return;
      }

      db.query(getEmployeesSql, queryParams, (errEmployees, employees) => {
        if (errEmployees) {
          console.error('Error fetching employees:', errEmployees);
          res.status(500).send('Internal Server Error');
          return;
        }

        // Объединяем работников с отделами и профессиями по id
        const employeesWithDetails = employees.map(employee => {
          const department = departments.find(dep => dep.id === employee.department_id);
          const profession = professions.find(prof => prof.id === employee.profession_id);

          return {
            ...employee,
            department: department ? department.name : null,
            profession: profession ? profession.name : null,
          };
        });

        // Отправляем представление с полученными данными, включая отделы и профессии
        res.render('employee/index', {
          employees: employeesWithDetails,
          departments: departments, // Передаем отделы в представление
          professions: professions, // Передаем профессии в представление
          title:'Employees'
        });
      });
    });
  });
});

//  middleware для проверки аутентификации
const isAuthenticated = (req, res, next) => {
  if (req.session && req.session.user) {
    // Пользователь аутентифицирован
    return next();
  } else {
    // Пользователь не аутентифицирован, перенаправляем на страницу входа
    res.redirect('/login');
  }
};

//  middleware для проверки прав доступа (администратора)
const isAdmin = (req, res, next) => {
  const user = req.session.user.is_admin;

  if (user) {
    // Пользователь является администратором
    return next();
  } else {
    // Пользователь не администратор, перенаправляем на страницу с сообщением об ошибке
    return res.status(403).send('Permission Denied'); // 403 Forbidden
  }
};

// Маршрут для отображения главной страницы админ панели
app.get('/admin', isAuthenticated, isAdmin, (req, res) => {
  // Ваши SQL-запросы для получения данных из базы данных (замените на свои)
  const getEmployeesSql = 'SELECT e.*, d.name AS department, p.name AS profession FROM employees e LEFT JOIN departments d ON e.department_id = d.id LEFT JOIN professions p ON e.profession_id = p.id';

  db.query(getEmployeesSql, (errEmployees, employees) => {
    if (errEmployees) {
      console.error('Error fetching employees:', errEmployees);
      res.status(500).send('Internal Server Error');
      return;
    }
    res.render('admin/index', {
      employees: employees,
      user: req.session.user,
      title:'Admin Panel'
    });
  });
});

// Маршрут для управления отделами
app.get('/department', (req, res) => {
  // Ваши SQL-запросы для получения данных отделов из базы данных (замените на свои)
  const getDepartmentsSql = 'SELECT * FROM departments';

  db.query(getDepartmentsSql, (errDepartments, departments) => {
    if (errDepartments) {
      console.error('Error fetching departments:', errDepartments);
      res.status(500).send('Internal Server Error');
      return;
    }

    // Отправляем представление с полученными данными
    res.render('department/index', {
      departments: departments,
      title:'Departments'
    });
  });
});

// Маршрут для отображения формы добавления нового отдела
app.get('/department/create', isAuthenticated, isAdmin, (req, res) => {
  res.render('department/create', {title:'Create Department'}); // Создайте соответствующий шаблон для отображения формы
});

// Маршрут для обработки отправки формы добавления нового отдела
app.post('/department/create', isAuthenticated, isAdmin, (req, res) => {
  const { name } = req.body;

  // Проверка наличия имени отдела
  if (!name) {
    req.flash('error', 'Department name is required');
    return res.redirect('/department/create');
  }

  //  SQL-запрос для добавления нового отдела в базу данных
  const addDepartmentSql = 'INSERT INTO departments (name) VALUES (?)';
  const addDepartmentValues = [name];

  db.query(addDepartmentSql, addDepartmentValues, (err) => {
    if (err) {
      console.error('Error adding department:', err);
      req.flash('error', 'Internal Server Error');
      return res.redirect('/department/create');
    }

    req.flash('success', 'Department added successfully');
    res.redirect('/department');
  });
});

// Маршрут для отображения формы редактирования отдела
app.get('/department/edit/:id', isAuthenticated, isAdmin, (req, res) => {
  const departmentId = req.params.id;

  // код для получения данных отдела по ID из базы данных
  const getDepartmentSql = 'SELECT * FROM departments WHERE id = ? LIMIT 1';

  db.query(getDepartmentSql, [departmentId], (err, department) => {
    if (err) {
      console.error('Error fetching department:', err);
      req.flash('error', 'Internal Server Error');
      return res.redirect('/department');
    }

    // Проверяем, найден ли отдел
    if (department.length === 0) {
      req.flash('error', 'Department not found');
      return res.redirect('/department');
    }

    res.render('department/edit', { department: department[0], title:'Edit Department'});
  });
});

// Маршрут для обработки отправки формы редактирования отдела
app.post('/department/edit/:id', isAuthenticated, isAdmin, (req, res) => {
  const departmentId = req.params.id;
  const { name } = req.body;

  // Проверка наличия имени отдела
  if (!name) {
    req.flash('error', 'Department name is required');
    return res.redirect(`/department/edit/${departmentId}`);
  }

  //  SQL-запрос для обновления данных отдела в базе данных
  const updateDepartmentSql = 'UPDATE departments SET name = ? WHERE id = ?';
  const updateDepartmentValues = [name, departmentId];

  db.query(updateDepartmentSql, updateDepartmentValues, (err) => {
    if (err) {
      console.error('Error updating department:', err);
      req.flash('error', 'Internal Server Error');
      return res.redirect(`/department/edit/${departmentId}`);
    }

    req.flash('success', 'Department updated successfully');
    res.redirect('/department');
  });
});

// Маршрут для обработки удаления отдела
app.post('/department/delete/:id', isAuthenticated, isAdmin, (req, res) => {
  const departmentId = req.params.id;

  //  SQL-запрос для удаления отдела из базы данных
  const deleteDepartmentSql = 'DELETE FROM departments WHERE id = ?';
  const deleteDepartmentValues = [departmentId];

  db.query(deleteDepartmentSql, deleteDepartmentValues, (err) => {
      if (err) {
          console.error('Error deleting department:', err);
          req.flash('error', 'Internal Server Error');
          return res.redirect('/department');
      }

      req.flash('success', 'Department deleted successfully');
      res.redirect('/department');
  });
});

// Маршрут для отображения списка профессий
app.get('/profession', isAuthenticated, isAdmin, (req, res) => {
  //  SQL-запрос для получения всех профессий из базы данных
  const getProfessionsSql = 'SELECT * FROM professions';

  db.query(getProfessionsSql, (err, professions) => {
      if (err) {
          console.error('Error fetching professions:', err);
          req.flash('error', 'Internal Server Error');
          return res.redirect('/');
      }

      res.render('profession/index', { professions, title:'Professions' });
  });
});

// Маршрут для отображения формы создания новой профессии
app.get('/profession/create', isAuthenticated, isAdmin, (req, res) => {
  res.render('profession/create', {title:'Create Profession'});
});

// Маршрут для обработки создания новой профессии
app.post('/profession/create', isAuthenticated, isAdmin, (req, res) => {
  const { name } = req.body;

  // Проверка наличия имени профессии
  if (!name) {
      req.flash('error', 'Profession name is required');
      return res.redirect('/profession/create');
  }

  // SQL-запрос для добавления новой профессии в базу данных
  const addProfessionSql = 'INSERT INTO professions (name) VALUES (?)';
  const addProfessionValues = [name];

  db.query(addProfessionSql, addProfessionValues, (err) => {
      if (err) {
          console.error('Error adding profession:', err);
          req.flash('error', 'Internal Server Error');
          return res.redirect('/profession/create');
      }

      req.flash('success', 'Profession added successfully');
      res.redirect('/profession');
  });
});

// Маршрут для отображения формы редактирования профессии
app.get('/profession/edit/:id', isAuthenticated, isAdmin, (req, res) => {
  const professionId = req.params.id;

  //  SQL-запрос для получения данных о профессии из базы данных
  const getProfessionSql = 'SELECT * FROM professions WHERE id = ?';
  const getProfessionValues = [professionId];

  db.query(getProfessionSql, getProfessionValues, (err, profession) => {
      if (err) {
          console.error('Error fetching profession:', err);
          req.flash('error', 'Internal Server Error');
          return res.redirect('/profession');
      }

      res.render('profession/edit', { profession: profession[0], title:'Edit Profession'});
  });
});

// Маршрут для обработки редактирования профессии
app.post('/profession/edit/:id', isAuthenticated, isAdmin, (req, res) => {
  const professionId = req.params.id;
  const { name } = req.body;

  // Проверка наличия имени профессии
  if (!name) {
      req.flash('error', 'Profession name is required');
      return res.redirect(`/profession/edit/${professionId}`);
  }

  // SQL-запрос для обновления данных профессии в базе данных
  const updateProfessionSql = 'UPDATE professions SET name = ? WHERE id = ?';
  const updateProfessionValues = [name, professionId];

  db.query(updateProfessionSql, updateProfessionValues, (err) => {
      if (err) {
          console.error('Error updating profession:', err);
          req.flash('error', 'Internal Server Error');
          return res.redirect(`/profession/edit/${professionId}`);
      }

      req.flash('success', 'Profession updated successfully');
      res.redirect('/profession');
  });
});

// Маршрут для удаления профессии
app.post('/profession/delete/:id', isAuthenticated, isAdmin, (req, res) => {
  const professionId = req.params.id;

  // SQL-запрос для удаления профессии из базы данных
  const deleteProfessionSql = 'DELETE FROM professions WHERE id = ?';
  const deleteProfessionValues = [professionId];

  db.query(deleteProfessionSql, deleteProfessionValues, (err) => {
      if (err) {
          console.error('Error deleting profession:', err);
          req.flash('error', 'Internal Server Error');
          return res.redirect('/profession');
      }

      req.flash('success', 'Profession deleted successfully');
      res.redirect('/profession');
  });
});


// Маршрут для отображения формы выбора отдела
app.get('/admin/createOne', isAuthenticated, isAdmin, (req, res) => {
  const getDepartmentsSql = 'SELECT * FROM departments';

  db.query(getDepartmentsSql, (err, departments) => {
    if (err) {
      console.error('Error fetching departments:', err);
      res.status(500).send('Internal Server Error');
      return;
    }

    res.render('admin/createOne', { departments, title:'Create employee' });
  });
});

// Маршрут для отображения формы выбора профессии в зависимости от отдела
app.post('/admin/createOne', isAuthenticated, isAdmin, (req, res) => {
  const selectedDepartment = req.body.department_id;
  const getProfessionsSql = 'SELECT * FROM professions WHERE id IN (SELECT profession_id FROM department_profession WHERE department_id = ?)';
  const getProfessionsValues = [selectedDepartment];

  db.query(getProfessionsSql, getProfessionsValues, (err, professions) => {
    if (err) {
      console.error('Error fetching professions:', err);
      res.status(500).send('Internal Server Error');
      return;
    }

    res.render('admin/createTwo', { professions, selectedDepartment, title:'Create Employee' });
  });
});

// Маршрут для обработки отправки формы создания работника
app.post('/admin/createTwo', isAuthenticated, isAdmin, (req, res) => {
  const { name, salary, department_id, profession_id } = req.body;

  // SQL-запрос для добавления нового работника в базу данных
  const addEmployeeSql = 'INSERT INTO employees (name, salary, department_id, profession_id) VALUES (?, ?, ?, ?)';
  const addEmployeeValues = [name, salary, department_id, profession_id];

  db.query(addEmployeeSql, addEmployeeValues, (err) => {
    if (err) {
      console.error('Error adding employee:', err);
      req.flash('error', 'Internal Server Error');
      return res.redirect('/admin/createOne');
    }

    req.flash('success', 'Employee added successfully');
    res.redirect('/admin');
  });
});

// Маршрут для удаления работника
app.post('/admin/delete/:id', isAuthenticated, isAdmin, (req, res) => {
  const employeeId = req.params.id;

  // SQL-запрос для удаления профессии из базы данных
  const deleteEmployeeSql = 'DELETE FROM employees WHERE id = ?';
  const deleteEmployeeValues = [employeeId];

  db.query(deleteEmployeeSql, deleteEmployeeValues, (err) => {
      if (err) {
          console.error('Error deleting profession:', err);
          req.flash('error', 'Internal Server Error');
          return res.redirect('/admin');
      }

      req.flash('success', 'Profession deleted successfully');
      res.redirect('/admin');
  });
});

// Маршрут для отображения формы редактирования отдела
app.get('/admin/editOne/:id', isAuthenticated, isAdmin, (req, res) => {
  const employeeId = req.params.id;
  const getEmployeeSql = 'SELECT * FROM employees WHERE id = ? LIMIT 1';
  const getEmployeeValues = [employeeId];

  db.query(getEmployeeSql, getEmployeeValues, (err, employee) => {
    if (err) {
      console.error('Error fetching employee:', err);
      res.status(500).send('Internal Server Error');
      return;
    }

    if (employee.length === 0) {
      res.status(404).send('Employee not found');
      return;
    }

    const getDepartmentsSql = 'SELECT * FROM departments';

    db.query(getDepartmentsSql, (err, departments) => {
      if (err) {
        console.error('Error fetching departments:', err);
        res.status(500).send('Internal Server Error');
        return;
      }
      res.render('admin/editOne', { employee: employee[0], departments, title:'Edit employee' });
    });
  });
});

// Маршрут для отображения формы редактирования профессии в зависимости от отдела
app.post('/admin/editOne/:id', isAuthenticated, isAdmin, (req, res) => {
  const employeeId = req.params.id;
  const selectedDepartment = req.body.department_id;

  const getProfessionsSql = 'SELECT * FROM professions WHERE id IN (SELECT profession_id FROM department_profession WHERE department_id = ?)';
  const getProfessionsValues = [selectedDepartment];

  db.query(getProfessionsSql, getProfessionsValues, (err, professions) => {
    if (err) {
      console.error('Error fetching professions:', err);
      res.status(500).send('Internal Server Error');
      return;
    }

    const getEmployeeSql = 'SELECT * FROM employees WHERE id = ? LIMIT 1';
    const getEmployeeValues = [employeeId];

    db.query(getEmployeeSql, getEmployeeValues, (err, employee) => {
      if (err) {
        console.error('Error fetching employee:', err);
        res.status(500).send('Internal Server Error');
        return;
      }

      if (employee.length === 0) {
        res.status(404).send('Employee not found');
        return;
      }
      res.render('admin/editTwo', { employee: employee[0], professions, selectedDepartment, title:'Edit Employee' });
    });
  });
});

// Маршрут для обработки отправки формы редактирования работника
app.post('/admin/editTwo/:id', isAuthenticated, isAdmin, (req, res) => {
  const employeeId = req.params.id;
  const { name, salary, department_id, profession_id } = req.body;
   // SQL-запрос для обновления данных работника в базе данных
  const updateEmployeeSql = 'UPDATE employees SET name = ?, salary = ?, department_id = ?, profession_id = ? WHERE id = ?';
  const updateEmployeeValues = [name, salary, department_id, profession_id, employeeId];

  db.query(updateEmployeeSql, updateEmployeeValues, (err) => {
    if (err) {
      console.error('Error updating employee:', err);
      req.flash('error', 'Internal Server Error');
      return res.redirect(`/admin/editOne/${employeeId}`);
    }

    req.flash('success', 'Employee updated successfully');
    res.redirect('/admin');
  });
});

app.listen(3000, function () {
  console.log('Server is running on port 3000');
});